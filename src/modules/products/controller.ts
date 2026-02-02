import { Response, NextFunction } from 'express'
import { ProductService } from './service.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { sendSuccess, sendPaginated } from '../../shared/utils/index.js'
import { NotFoundError } from '../../shared/errors/index.js'

// ============================================
// Product Controller
// ============================================

export class ProductController {
  constructor(private productService: ProductService) {}

  // ==========================================
  // Products
  // ==========================================

  list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { data, total } = await this.productService.findMany(req.query as Record<string, unknown>)
      sendPaginated(res, data, total, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
      })
    } catch (error) {
      next(error)
    }
  }

  getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const product = await this.productService.findById(req.params.id)
      if (!product) {
        throw new NotFoundError('Product not found')
      }
      sendSuccess(res, product)
    } catch (error) {
      next(error)
    }
  }

  getBySlug = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const product = await this.productService.findBySlug(req.params.slug)
      if (!product) {
        throw new NotFoundError('Product not found')
      }
      sendSuccess(res, product)
    } catch (error) {
      next(error)
    }
  }

  create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const product = await this.productService.create(req.body)
      sendSuccess(res, product, 201)
    } catch (error) {
      next(error)
    }
  }

  update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const product = await this.productService.update(req.params.id, req.body)
      sendSuccess(res, product)
    } catch (error) {
      next(error)
    }
  }

  delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.productService.delete(req.params.id)
      sendSuccess(res, { message: 'Product deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Variants
  // ==========================================

  addVariant = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const variant = await this.productService.addVariant(req.params.id, req.body)
      sendSuccess(res, variant, 201)
    } catch (error) {
      next(error)
    }
  }

  updateVariant = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const variant = await this.productService.updateVariant(req.params.variantId, req.body)
      sendSuccess(res, variant)
    } catch (error) {
      next(error)
    }
  }

  deleteVariant = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.productService.deleteVariant(req.params.variantId)
      sendSuccess(res, { message: 'Variant deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  updateInventory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const variant = await this.productService.updateInventory(req.params.variantId, req.body)
      sendSuccess(res, variant)
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Categories
  // ==========================================

  listCategories = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const categories = await this.productService.getCategories()
      sendSuccess(res, categories)
    } catch (error) {
      next(error)
    }
  }

  getCategoryById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.productService.getCategoryById(req.params.id)
      if (!category) {
        throw new NotFoundError('Category not found')
      }
      sendSuccess(res, category)
    } catch (error) {
      next(error)
    }
  }

  createCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.productService.createCategory(req.body)
      sendSuccess(res, category, 201)
    } catch (error) {
      next(error)
    }
  }

  updateCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const category = await this.productService.updateCategory(req.params.id, req.body)
      sendSuccess(res, category)
    } catch (error) {
      next(error)
    }
  }

  deleteCategory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.productService.deleteCategory(req.params.id)
      sendSuccess(res, { message: 'Category deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Images
  // ==========================================

  addImage = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const image = await this.productService.addImage(req.params.id, req.body)
      sendSuccess(res, image, 201)
    } catch (error) {
      next(error)
    }
  }

  deleteImage = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.productService.deleteImage(req.params.imageId)
      sendSuccess(res, { message: 'Image deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  reorderImages = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.productService.reorderImages(req.params.id, req.body.imageIds)
      sendSuccess(res, { message: 'Images reordered successfully' })
    } catch (error) {
      next(error)
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createProductController(productService: ProductService): ProductController {
  return new ProductController(productService)
}
