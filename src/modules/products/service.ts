import { PrismaClient } from '@prisma/client'
import {
  Product,
  ProductWithRelations,
  ProductVariant,
  Category,
  CategoryWithChildren,
  ProductImage,
  CreateProductInput,
  UpdateProductInput,
  CreateVariantInput,
  UpdateVariantInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateImageInput,
  UpdateInventoryInput,
  ProductModuleConfig,
  ProductQueryParams,
} from './types.js'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/index.js'
import { getEventBus } from '../../shared/events/index.js'
import { generateSlug } from '../../shared/utils/index.js'

// ============================================
// Product Service
// ============================================

export class ProductService {
  private prisma: PrismaClient
  private config: ProductModuleConfig
  private eventBus = getEventBus()

  constructor(prisma: PrismaClient, config: ProductModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  // ==========================================
  // Product CRUD
  // ==========================================

  async findById(id: string): Promise<ProductWithRelations | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        categories: { include: { category: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })
    return product as ProductWithRelations | null
  }

  async findBySlug(slug: string): Promise<ProductWithRelations | null> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        variants: true,
        categories: { include: { category: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })
    return product as ProductWithRelations | null
  }

  async findMany(params: ProductQueryParams): Promise<{ data: ProductWithRelations[]; total: number }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      status,
      categoryId,
      minPrice,
      maxPrice,
      inStock,
      includeDeleted = false,
    } = params

    const where: Record<string, unknown> = {}

    if (!includeDeleted && this.config.features?.softDelete !== false) {
      where.deletedAt = null
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ]
    }

    if (categoryId) {
      where.categories = { some: { categoryId } }
    }

    // Price and stock filters need to be on variants
    if (minPrice !== undefined || maxPrice !== undefined || inStock !== undefined) {
      const variantWhere: Record<string, unknown> = {}

      if (minPrice !== undefined) {
        variantWhere.price = { ...(variantWhere.price as object || {}), gte: minPrice }
      }
      if (maxPrice !== undefined) {
        variantWhere.price = { ...(variantWhere.price as object || {}), lte: maxPrice }
      }
      if (inStock === true) {
        variantWhere.quantity = { gt: 0 }
      }

      where.variants = { some: variantWhere }
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          variants: true,
          categories: { include: { category: true } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      this.prisma.product.count({ where }),
    ])

    return { data: data as ProductWithRelations[], total }
  }

  async create(data: CreateProductInput): Promise<ProductWithRelations> {
    const slug = data.slug || generateSlug(data.name)

    // Check slug uniqueness
    const existing = await this.findBySlug(slug)
    if (existing) {
      throw new ConflictError('Product with this slug already exists')
    }

    // Run beforeCreate hook
    let productData = { ...data, slug }
    if (this.config.hooks?.beforeCreate) {
      productData = await this.config.hooks.beforeCreate(productData)
    }

    const product = await this.prisma.product.create({
      data: {
        name: productData.name,
        slug: productData.slug,
        description: productData.description,
        status: productData.status || 'draft',
        metadata: productData.metadata as object | undefined,
        variants: productData.variants
          ? {
              create: productData.variants.map((v, i) => ({
                ...v,
                isDefault: v.isDefault ?? i === 0,
              })),
            }
          : undefined,
        categories: productData.categoryIds
          ? {
              create: productData.categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
        images: productData.images
          ? {
              create: productData.images.map((img, i) => ({
                ...img,
                sortOrder: img.sortOrder ?? i,
              })),
            }
          : undefined,
      },
      include: {
        variants: true,
        categories: { include: { category: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })

    // Emit event
    this.eventBus.emit('product.created', { productId: product.id, name: product.name })

    // Run afterCreate hook
    if (this.config.hooks?.afterCreate) {
      await this.config.hooks.afterCreate(product as ProductWithRelations)
    }

    return product as ProductWithRelations
  }

  async update(id: string, data: UpdateProductInput): Promise<ProductWithRelations> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new NotFoundError('Product not found')
    }

    // Check slug uniqueness if changing
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await this.findBySlug(data.slug)
      if (slugExists) {
        throw new ConflictError('Product with this slug already exists')
      }
    }

    // Run beforeUpdate hook
    let updateData = { ...data }
    if (this.config.hooks?.beforeUpdate) {
      updateData = await this.config.hooks.beforeUpdate(id, updateData)
    }

    // Track status change for hook
    const oldStatus = existing.status

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: updateData.name,
        slug: updateData.slug,
        description: updateData.description,
        status: updateData.status,
        metadata: updateData.metadata as object | undefined,
        categories: updateData.categoryIds
          ? {
              deleteMany: {},
              create: updateData.categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: {
        variants: true,
        categories: { include: { category: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })

    // Emit event
    this.eventBus.emit('product.updated', { productId: product.id, changes: data })

    // Status change hook
    if (updateData.status && updateData.status !== oldStatus && this.config.hooks?.onStatusChange) {
      await this.config.hooks.onStatusChange(id, oldStatus, updateData.status)
    }

    // Run afterUpdate hook
    if (this.config.hooks?.afterUpdate) {
      await this.config.hooks.afterUpdate(product as ProductWithRelations)
    }

    return product as ProductWithRelations
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new NotFoundError('Product not found')
    }

    // Run beforeDelete hook
    if (this.config.hooks?.beforeDelete) {
      await this.config.hooks.beforeDelete(id)
    }

    if (this.config.features?.softDelete !== false) {
      await this.prisma.product.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
    } else {
      await this.prisma.product.delete({ where: { id } })
    }

    // Emit event
    this.eventBus.emit('product.deleted', { productId: id })

    // Run afterDelete hook
    if (this.config.hooks?.afterDelete) {
      await this.config.hooks.afterDelete(id)
    }
  }

  // ==========================================
  // Variants
  // ==========================================

  async getVariantById(id: string): Promise<ProductVariant | null> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
    })
    return variant as ProductVariant | null
  }

  async addVariant(productId: string, data: CreateVariantInput): Promise<ProductVariant> {
    const product = await this.findById(productId)
    if (!product) {
      throw new NotFoundError('Product not found')
    }

    // Check SKU uniqueness
    const existingSku = await this.prisma.productVariant.findUnique({
      where: { sku: data.sku },
    })
    if (existingSku) {
      throw new ConflictError('SKU already exists')
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        ...data,
      },
    })

    return variant as ProductVariant
  }

  async updateVariant(variantId: string, data: UpdateVariantInput): Promise<ProductVariant> {
    const existing = await this.getVariantById(variantId)
    if (!existing) {
      throw new NotFoundError('Variant not found')
    }

    // Check SKU uniqueness if changing
    if (data.sku && data.sku !== existing.sku) {
      const skuExists = await this.prisma.productVariant.findUnique({
        where: { sku: data.sku },
      })
      if (skuExists) {
        throw new ConflictError('SKU already exists')
      }
    }

    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data,
    })

    return variant as ProductVariant
  }

  async deleteVariant(variantId: string): Promise<void> {
    const existing = await this.getVariantById(variantId)
    if (!existing) {
      throw new NotFoundError('Variant not found')
    }

    // Check if it's the only variant
    const count = await this.prisma.productVariant.count({
      where: { productId: existing.productId },
    })

    if (count <= 1) {
      throw new BadRequestError('Cannot delete the only variant of a product')
    }

    await this.prisma.productVariant.delete({ where: { id: variantId } })
  }

  async updateInventory(variantId: string, data: UpdateInventoryInput): Promise<ProductVariant> {
    const existing = await this.getVariantById(variantId)
    if (!existing) {
      throw new NotFoundError('Variant not found')
    }

    const oldQuantity = existing.quantity
    const newQuantity = data.quantity

    // Check if negative inventory is allowed
    if (newQuantity < 0 && !this.config.inventory?.allowNegative) {
      throw new BadRequestError('Negative inventory is not allowed')
    }

    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { quantity: newQuantity },
    })

    // Emit event
    this.eventBus.emit('product.stockUpdated', { productId: existing.productId, quantity: newQuantity })

    // Inventory change hook
    if (this.config.hooks?.onInventoryChange) {
      await this.config.hooks.onInventoryChange(variantId, oldQuantity, newQuantity)
    }

    // Low stock hook
    const threshold = this.config.inventory?.lowStockThreshold || 10
    if (newQuantity <= threshold && newQuantity < oldQuantity && this.config.hooks?.onLowStock) {
      await this.config.hooks.onLowStock(variantId, newQuantity)
    }

    return variant as ProductVariant
  }

  // ==========================================
  // Categories
  // ==========================================

  async getCategories(): Promise<CategoryWithChildren[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    // Build tree structure
    return this.buildCategoryTree(categories as Category[])
  }

  async getCategoryById(id: string): Promise<Category | null> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    })
    return category as Category | null
  }

  async createCategory(data: CreateCategoryInput): Promise<Category> {
    const slug = data.slug || generateSlug(data.name)

    // Check slug uniqueness
    const existing = await this.prisma.category.findUnique({
      where: { slug },
    })
    if (existing) {
      throw new ConflictError('Category with this slug already exists')
    }

    // Validate parent exists
    if (data.parentId) {
      const parent = await this.getCategoryById(data.parentId)
      if (!parent) {
        throw new NotFoundError('Parent category not found')
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        parentId: data.parentId,
        sortOrder: data.sortOrder || 0,
      },
    })

    return category as Category
  }

  async updateCategory(id: string, data: UpdateCategoryInput): Promise<Category> {
    const existing = await this.getCategoryById(id)
    if (!existing) {
      throw new NotFoundError('Category not found')
    }

    // Check slug uniqueness if changing
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await this.prisma.category.findUnique({
        where: { slug: data.slug },
      })
      if (slugExists) {
        throw new ConflictError('Category with this slug already exists')
      }
    }

    // Prevent circular parent reference
    if (data.parentId === id) {
      throw new BadRequestError('Category cannot be its own parent')
    }

    const category = await this.prisma.category.update({
      where: { id },
      data,
    })

    return category as Category
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.getCategoryById(id)
    if (!existing) {
      throw new NotFoundError('Category not found')
    }

    // Check for children
    const children = await this.prisma.category.count({
      where: { parentId: id },
    })
    if (children > 0) {
      throw new BadRequestError('Cannot delete category with children')
    }

    await this.prisma.category.delete({ where: { id } })
  }

  // ==========================================
  // Images
  // ==========================================

  async addImage(productId: string, data: CreateImageInput): Promise<ProductImage> {
    const product = await this.findById(productId)
    if (!product) {
      throw new NotFoundError('Product not found')
    }

    // Get max sort order
    const maxSort = await this.prisma.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    })

    const image = await this.prisma.productImage.create({
      data: {
        productId,
        url: data.url,
        alt: data.alt,
        sortOrder: data.sortOrder ?? (maxSort._max.sortOrder || 0) + 1,
      },
    })

    return image as ProductImage
  }

  async deleteImage(imageId: string): Promise<void> {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    })
    if (!image) {
      throw new NotFoundError('Image not found')
    }

    await this.prisma.productImage.delete({ where: { id: imageId } })
  }

  async reorderImages(productId: string, imageIds: string[]): Promise<void> {
    const product = await this.findById(productId)
    if (!product) {
      throw new NotFoundError('Product not found')
    }

    // Update sort order for each image
    await Promise.all(
      imageIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    )
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
    const map = new Map<string, CategoryWithChildren>()
    const roots: CategoryWithChildren[] = []

    // Create map
    categories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] })
    })

    // Build tree
    categories.forEach((cat) => {
      const node = map.get(cat.id)!
      if (cat.parentId) {
        const parent = map.get(cat.parentId)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(node)
        }
      } else {
        roots.push(node)
      }
    })

    return roots
  }
}

// ============================================
// Factory Function
// ============================================

export function createProductService(
  prisma: PrismaClient,
  config: ProductModuleConfig
): ProductService {
  return new ProductService(prisma, config)
}
