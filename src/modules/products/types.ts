import { BaseModuleConfig, ModuleHooks, MonetaryValue, CrudHooks } from '../../shared/types/index.js'

// ============================================
// Product Module Types
// ============================================

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  status: ProductStatus
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export type ProductStatus = 'draft' | 'active' | 'archived'

export interface ProductWithRelations extends Product {
  variants: ProductVariant[]
  categories: { category: Category }[]
  images: ProductImage[]
}

export interface ProductVariant {
  id: string
  productId: string
  sku: string
  name: string
  price: MonetaryValue
  comparePrice: MonetaryValue | null
  cost: MonetaryValue | null
  quantity: number
  weight: MonetaryValue | null
  options: Record<string, string> | null
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
  parent?: Category | null
}

export interface ProductImage {
  id: string
  productId: string
  url: string
  alt: string | null
  sortOrder: number
  createdAt: Date
}

// ============================================
// Input Types
// ============================================

export interface CreateProductInput {
  name: string
  slug?: string
  description?: string
  status?: ProductStatus
  metadata?: Record<string, unknown>
  variants?: CreateVariantInput[]
  categoryIds?: string[]
  images?: CreateImageInput[]
}

export interface UpdateProductInput {
  name?: string
  slug?: string
  description?: string
  status?: ProductStatus
  metadata?: Record<string, unknown>
  categoryIds?: string[]
}

export interface CreateVariantInput {
  sku: string
  name: string
  price: number
  comparePrice?: number
  cost?: number
  quantity?: number
  weight?: number
  options?: Record<string, string>
  isDefault?: boolean
}

export interface UpdateVariantInput {
  sku?: string
  name?: string
  price?: number
  comparePrice?: number
  cost?: number
  quantity?: number
  weight?: number
  options?: Record<string, string>
  isDefault?: boolean
}

export interface CreateImageInput {
  url: string
  alt?: string
  sortOrder?: number
}

export interface CreateCategoryInput {
  name: string
  slug?: string
  description?: string
  parentId?: string
  sortOrder?: number
}

export interface UpdateCategoryInput {
  name?: string
  slug?: string
  description?: string
  parentId?: string
  sortOrder?: number
}

export interface UpdateInventoryInput {
  quantity: number
  reason?: string
}

// ============================================
// Query Types
// ============================================

export interface ProductQueryParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  status?: ProductStatus
  categoryId?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  includeDeleted?: boolean
}

export interface VariantQueryParams {
  productId?: string
  inStock?: boolean
  minPrice?: number
  maxPrice?: number
}

// ============================================
// Module Configuration
// ============================================

export interface ProductModuleConfig extends BaseModuleConfig {
  /** Inventory settings */
  inventory?: {
    /** Track inventory levels */
    trackInventory?: boolean
    /** Allow negative inventory */
    allowNegative?: boolean
    /** Low stock threshold */
    lowStockThreshold?: number
  }

  /** Pricing settings */
  pricing?: {
    /** Default currency */
    defaultCurrency?: string
    /** Include tax in price */
    taxInclusive?: boolean
  }

  /** Feature flags */
  features?: {
    /** Enable soft delete */
    softDelete?: boolean
    /** Enable variant options */
    variantOptions?: boolean
    /** Enable categories */
    categories?: boolean
    /** Enable product images */
    images?: boolean
  }

  /** Module-specific hooks */
  hooks?: ProductModuleHooks
}

export interface ProductModuleHooks extends CrudHooks<Product, CreateProductInput, UpdateProductInput> {
  /** Called when inventory changes */
  onInventoryChange?: (variantId: string, oldQty: number, newQty: number) => void | Promise<void>
  /** Called when inventory is low */
  onLowStock?: (variantId: string, quantity: number) => void | Promise<void>
  /** Called when product status changes */
  onStatusChange?: (productId: string, oldStatus: ProductStatus, newStatus: ProductStatus) => void | Promise<void>
}

// ============================================
// Service Interface
// ============================================

export interface IProductService {
  // Product CRUD
  findById(id: string): Promise<ProductWithRelations | null>
  findBySlug(slug: string): Promise<ProductWithRelations | null>
  findMany(params: ProductQueryParams): Promise<{ data: ProductWithRelations[]; total: number }>
  create(data: CreateProductInput): Promise<ProductWithRelations>
  update(id: string, data: UpdateProductInput): Promise<ProductWithRelations>
  delete(id: string): Promise<void>

  // Variants
  addVariant(productId: string, data: CreateVariantInput): Promise<ProductVariant>
  updateVariant(variantId: string, data: UpdateVariantInput): Promise<ProductVariant>
  deleteVariant(variantId: string): Promise<void>
  updateInventory(variantId: string, data: UpdateInventoryInput): Promise<ProductVariant>

  // Categories
  getCategories(): Promise<CategoryWithChildren[]>
  createCategory(data: CreateCategoryInput): Promise<Category>
  updateCategory(id: string, data: UpdateCategoryInput): Promise<Category>
  deleteCategory(id: string): Promise<void>

  // Images
  addImage(productId: string, data: CreateImageInput): Promise<ProductImage>
  deleteImage(imageId: string): Promise<void>
  reorderImages(productId: string, imageIds: string[]): Promise<void>
}
