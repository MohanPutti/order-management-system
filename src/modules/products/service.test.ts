import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductService } from './service.js'
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/index.js'

// Mock PrismaClient
const mockPrisma = {
  product: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  productVariant: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  category: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  productImage: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
  },
}

// Mock event bus
vi.mock('../../shared/events/index.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
  }),
}))

describe('ProductService', () => {
  let service: ProductService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProductService(mockPrisma as any, {})
  })

  describe('findById', () => {
    it('should return product with relations', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'Test Product',
        slug: 'test-product',
        variants: [{ id: 'var-1', sku: 'SKU-001' }],
        categories: [],
        images: [],
      }
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct)

      const result = await service.findById('prod-1')

      expect(result).toEqual(mockProduct)
      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        include: {
          variants: true,
          categories: { include: { category: true } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      })
    })

    it('should return null for non-existent product', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null)

      const result = await service.findById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('findBySlug', () => {
    it('should find product by slug', async () => {
      const mockProduct = { id: 'prod-1', slug: 'test-product' }
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct)

      const result = await service.findBySlug('test-product')

      expect(result).toEqual(mockProduct)
      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-product' },
        include: expect.any(Object),
      })
    })
  })

  describe('findMany', () => {
    it('should return paginated products', async () => {
      const mockProducts = [
        { id: 'prod-1', name: 'Product 1' },
        { id: 'prod-2', name: 'Product 2' },
      ]
      mockPrisma.product.findMany.mockResolvedValue(mockProducts)
      mockPrisma.product.count.mockResolvedValue(10)

      const result = await service.findMany({ page: 1, limit: 10 })

      expect(result.data).toEqual(mockProducts)
      expect(result.total).toBe(10)
    })

    it('should filter by status', async () => {
      mockPrisma.product.findMany.mockResolvedValue([])
      mockPrisma.product.count.mockResolvedValue(0)

      await service.findMany({ status: 'active' })

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        })
      )
    })

    it('should search by name or description', async () => {
      mockPrisma.product.findMany.mockResolvedValue([])
      mockPrisma.product.count.mockResolvedValue(0)

      await service.findMany({ search: 'test' })

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'test' } },
              { description: { contains: 'test' } },
            ],
          }),
        })
      )
    })

    it('should exclude deleted products by default', async () => {
      mockPrisma.product.findMany.mockResolvedValue([])
      mockPrisma.product.count.mockResolvedValue(0)

      await service.findMany({})

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        })
      )
    })

    it('should include deleted products when specified', async () => {
      mockPrisma.product.findMany.mockResolvedValue([])
      mockPrisma.product.count.mockResolvedValue(0)

      await service.findMany({ includeDeleted: true })

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletedAt: null }),
        })
      )
    })
  })

  describe('create', () => {
    it('should create product with generated slug', async () => {
      const mockCreatedProduct = {
        id: 'prod-1',
        name: 'Test Product',
        slug: 'test-product',
        variants: [],
        categories: [],
        images: [],
      }
      mockPrisma.product.findUnique.mockResolvedValue(null)
      mockPrisma.product.create.mockResolvedValue(mockCreatedProduct)

      const result = await service.create({
        name: 'Test Product',
        description: 'A test product',
      })

      expect(result).toEqual(mockCreatedProduct)
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Product',
            slug: 'test-product',
          }),
        })
      )
    })

    it('should throw ConflictError for duplicate slug', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'existing' })

      await expect(service.create({ name: 'Test Product' }))
        .rejects.toThrow(ConflictError)
    })

    it('should use provided slug', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null)
      mockPrisma.product.create.mockResolvedValue({
        id: 'prod-1',
        slug: 'custom-slug',
        variants: [],
        categories: [],
        images: [],
      })

      await service.create({
        name: 'Test Product',
        slug: 'custom-slug',
      })

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'custom-slug',
          }),
        })
      )
    })
  })

  describe('update', () => {
    it('should update product', async () => {
      const existingProduct = {
        id: 'prod-1',
        name: 'Old Name',
        slug: 'old-slug',
        status: 'draft',
        variants: [],
        categories: [],
        images: [],
      }
      mockPrisma.product.findUnique
        .mockResolvedValueOnce(existingProduct)
        .mockResolvedValueOnce(null) // slug check
      mockPrisma.product.update.mockResolvedValue({
        ...existingProduct,
        name: 'New Name',
      })

      const result = await service.update('prod-1', { name: 'New Name' })

      expect(result.name).toBe('New Name')
    })

    it('should throw NotFoundError for non-existent product', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null)

      await expect(service.update('non-existent', { name: 'New Name' }))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw ConflictError for duplicate slug', async () => {
      const existingProduct = {
        id: 'prod-1',
        slug: 'old-slug',
        variants: [],
        categories: [],
        images: [],
      }
      mockPrisma.product.findUnique
        .mockResolvedValueOnce(existingProduct)
        .mockResolvedValueOnce({ id: 'other-product' }) // slug check returns different product

      await expect(service.update('prod-1', { slug: 'taken-slug' }))
        .rejects.toThrow(ConflictError)
    })
  })

  describe('delete', () => {
    it('should soft delete product by default', async () => {
      const existingProduct = {
        id: 'prod-1',
        variants: [],
        categories: [],
        images: [],
      }
      mockPrisma.product.findUnique.mockResolvedValue(existingProduct)
      mockPrisma.product.update.mockResolvedValue({})

      await service.delete('prod-1')

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { deletedAt: expect.any(Date) },
      })
    })

    it('should throw NotFoundError for non-existent product', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null)

      await expect(service.delete('non-existent'))
        .rejects.toThrow(NotFoundError)
    })

    it('should hard delete when softDelete is disabled', async () => {
      const serviceWithHardDelete = new ProductService(mockPrisma as any, {
        features: { softDelete: false },
      })
      const existingProduct = {
        id: 'prod-1',
        variants: [],
        categories: [],
        images: [],
      }
      mockPrisma.product.findUnique.mockResolvedValue(existingProduct)

      await serviceWithHardDelete.delete('prod-1')

      expect(mockPrisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      })
    })
  })

  describe('Variants', () => {
    describe('getVariantById', () => {
      it('should return variant', async () => {
        const mockVariant = { id: 'var-1', sku: 'SKU-001' }
        mockPrisma.productVariant.findUnique.mockResolvedValue(mockVariant)

        const result = await service.getVariantById('var-1')

        expect(result).toEqual(mockVariant)
      })
    })

    describe('addVariant', () => {
      it('should add variant to product', async () => {
        mockPrisma.product.findUnique.mockResolvedValue({
          id: 'prod-1',
          variants: [],
          categories: [],
          images: [],
        })
        mockPrisma.productVariant.findUnique.mockResolvedValue(null)
        mockPrisma.productVariant.create.mockResolvedValue({
          id: 'var-1',
          productId: 'prod-1',
          sku: 'SKU-001',
          price: 100,
        })

        const result = await service.addVariant('prod-1', {
          sku: 'SKU-001',
          name: 'Default',
          price: 100,
          quantity: 10,
        })

        expect(result.sku).toBe('SKU-001')
      })

      it('should throw NotFoundError for non-existent product', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(null)

        await expect(service.addVariant('non-existent', {
          sku: 'SKU-001',
          name: 'Default',
          price: 100,
          quantity: 10,
        })).rejects.toThrow(NotFoundError)
      })

      it('should throw ConflictError for duplicate SKU', async () => {
        mockPrisma.product.findUnique.mockResolvedValue({
          id: 'prod-1',
          variants: [],
          categories: [],
          images: [],
        })
        mockPrisma.productVariant.findUnique.mockResolvedValue({ id: 'existing' })

        await expect(service.addVariant('prod-1', {
          sku: 'SKU-001',
          name: 'Default',
          price: 100,
          quantity: 10,
        })).rejects.toThrow(ConflictError)
      })
    })

    describe('deleteVariant', () => {
      it('should delete variant', async () => {
        mockPrisma.productVariant.findUnique.mockResolvedValue({
          id: 'var-1',
          productId: 'prod-1',
        })
        mockPrisma.productVariant.count.mockResolvedValue(2)

        await service.deleteVariant('var-1')

        expect(mockPrisma.productVariant.delete).toHaveBeenCalledWith({
          where: { id: 'var-1' },
        })
      })

      it('should throw BadRequestError when deleting last variant', async () => {
        mockPrisma.productVariant.findUnique.mockResolvedValue({
          id: 'var-1',
          productId: 'prod-1',
        })
        mockPrisma.productVariant.count.mockResolvedValue(1)

        await expect(service.deleteVariant('var-1'))
          .rejects.toThrow(BadRequestError)
      })
    })

    describe('updateInventory', () => {
      it('should update inventory quantity', async () => {
        mockPrisma.productVariant.findUnique.mockResolvedValue({
          id: 'var-1',
          productId: 'prod-1',
          quantity: 10,
        })
        mockPrisma.productVariant.update.mockResolvedValue({
          id: 'var-1',
          quantity: 20,
        })

        const result = await service.updateInventory('var-1', { quantity: 20 })

        expect(result.quantity).toBe(20)
      })

      it('should throw BadRequestError for negative inventory when not allowed', async () => {
        const serviceNoNegative = new ProductService(mockPrisma as any, {
          inventory: { allowNegative: false },
        })
        mockPrisma.productVariant.findUnique.mockResolvedValue({
          id: 'var-1',
          productId: 'prod-1',
          quantity: 10,
        })

        await expect(serviceNoNegative.updateInventory('var-1', { quantity: -5 }))
          .rejects.toThrow(BadRequestError)
      })
    })
  })

  describe('Categories', () => {
    describe('getCategories', () => {
      it('should return category tree', async () => {
        const mockCategories = [
          { id: 'cat-1', name: 'Parent', parentId: null, sortOrder: 0 },
          { id: 'cat-2', name: 'Child', parentId: 'cat-1', sortOrder: 0 },
        ]
        mockPrisma.category.findMany.mockResolvedValue(mockCategories)

        const result = await service.getCategories()

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('cat-1')
        expect(result[0].children).toHaveLength(1)
        expect(result[0].children[0].id).toBe('cat-2')
      })
    })

    describe('createCategory', () => {
      it('should create category with generated slug', async () => {
        mockPrisma.category.findUnique.mockResolvedValue(null)
        mockPrisma.category.create.mockResolvedValue({
          id: 'cat-1',
          name: 'Electronics',
          slug: 'electronics',
        })

        const result = await service.createCategory({
          name: 'Electronics',
        })

        expect(result.slug).toBe('electronics')
      })

      it('should throw ConflictError for duplicate slug', async () => {
        mockPrisma.category.findUnique.mockResolvedValue({ id: 'existing' })

        await expect(service.createCategory({ name: 'Electronics' }))
          .rejects.toThrow(ConflictError)
      })

      it('should validate parent exists', async () => {
        mockPrisma.category.findUnique
          .mockResolvedValueOnce(null) // slug check
          .mockResolvedValueOnce(null) // parent check

        await expect(service.createCategory({
          name: 'Subcategory',
          parentId: 'non-existent',
        })).rejects.toThrow(NotFoundError)
      })
    })

    describe('updateCategory', () => {
      it('should prevent circular parent reference', async () => {
        mockPrisma.category.findUnique.mockResolvedValue({
          id: 'cat-1',
          slug: 'category',
        })

        await expect(service.updateCategory('cat-1', { parentId: 'cat-1' }))
          .rejects.toThrow(BadRequestError)
      })
    })

    describe('deleteCategory', () => {
      it('should throw BadRequestError when category has children', async () => {
        mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' })
        mockPrisma.category.count.mockResolvedValue(2)

        await expect(service.deleteCategory('cat-1'))
          .rejects.toThrow(BadRequestError)
      })
    })
  })

  describe('Images', () => {
    describe('addImage', () => {
      it('should add image with auto sort order', async () => {
        mockPrisma.product.findUnique.mockResolvedValue({
          id: 'prod-1',
          variants: [],
          categories: [],
          images: [],
        })
        mockPrisma.productImage.aggregate.mockResolvedValue({
          _max: { sortOrder: 2 },
        })
        mockPrisma.productImage.create.mockResolvedValue({
          id: 'img-1',
          productId: 'prod-1',
          url: 'https://example.com/image.jpg',
          sortOrder: 3,
        })

        const result = await service.addImage('prod-1', {
          url: 'https://example.com/image.jpg',
        })

        expect(result.sortOrder).toBe(3)
      })
    })

    describe('deleteImage', () => {
      it('should delete image', async () => {
        mockPrisma.productImage.findUnique.mockResolvedValue({
          id: 'img-1',
          productId: 'prod-1',
        })

        await service.deleteImage('img-1')

        expect(mockPrisma.productImage.delete).toHaveBeenCalledWith({
          where: { id: 'img-1' },
        })
      })

      it('should throw NotFoundError for non-existent image', async () => {
        mockPrisma.productImage.findUnique.mockResolvedValue(null)

        await expect(service.deleteImage('non-existent'))
          .rejects.toThrow(NotFoundError)
      })
    })

    describe('reorderImages', () => {
      it('should update sort order for all images', async () => {
        mockPrisma.product.findUnique.mockResolvedValue({
          id: 'prod-1',
          variants: [],
          categories: [],
          images: [],
        })
        mockPrisma.productImage.update.mockResolvedValue({})

        await service.reorderImages('prod-1', ['img-3', 'img-1', 'img-2'])

        expect(mockPrisma.productImage.update).toHaveBeenCalledTimes(3)
        expect(mockPrisma.productImage.update).toHaveBeenNthCalledWith(1, {
          where: { id: 'img-3' },
          data: { sortOrder: 0 },
        })
        expect(mockPrisma.productImage.update).toHaveBeenNthCalledWith(2, {
          where: { id: 'img-1' },
          data: { sortOrder: 1 },
        })
        expect(mockPrisma.productImage.update).toHaveBeenNthCalledWith(3, {
          where: { id: 'img-2' },
          data: { sortOrder: 2 },
        })
      })
    })
  })
})
