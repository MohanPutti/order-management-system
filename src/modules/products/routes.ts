import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { ProductService, createProductService } from './service.js'
import { ProductController, createProductController } from './controller.js'
import { ProductModuleConfig } from './types.js'
import {
  validateBody,
  validateQuery,
  validateParams,
  createAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  updateInventorySchema,
  createCategorySchema,
  updateCategorySchema,
  createImageSchema,
  reorderImagesSchema,
  productQuerySchema,
  idParamSchema,
} from './validators.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'

// ============================================
// Product Routes Factory
// ============================================

export interface CreateProductRouterOptions {
  prisma: PrismaClient
  config: ProductModuleConfig
  /** Function to verify token and return user (for auth) */
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createProductRouter(options: CreateProductRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  // Create service and controller
  const productService = createProductService(prisma, config)
  const controller = createProductController(productService)

  // Auth middleware (optional - some routes may be public)
  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  // Apply custom middleware if provided
  if (config.middleware) {
    config.middleware.forEach((mw) => router.use(mw))
  }

  // ==========================================
  // Public Routes
  // ==========================================

  // Products (public read)
  router.get('/products', validateQuery(productQuerySchema), controller.list)
  router.get('/products/slug/:slug', controller.getBySlug)
  router.get('/products/:id', validateParams(idParamSchema), controller.getById)

  // Categories (public read)
  router.get('/categories', controller.listCategories)
  router.get('/categories/:id', validateParams(idParamSchema), controller.getCategoryById)

  // ==========================================
  // Protected Routes (Requires Auth)
  // ==========================================

  // Products management
  router.post(
    '/products',
    authenticate,
    requirePermissions('products.create'),
    validateBody(createProductSchema),
    controller.create
  )

  router.put(
    '/products/:id',
    authenticate,
    requirePermissions('products.update'),
    validateParams(idParamSchema),
    validateBody(updateProductSchema),
    controller.update
  )

  router.delete(
    '/products/:id',
    authenticate,
    requirePermissions('products.delete'),
    validateParams(idParamSchema),
    controller.delete
  )

  // Variants
  router.post(
    '/products/:id/variants',
    authenticate,
    requirePermissions('products.update'),
    validateParams(idParamSchema),
    validateBody(createVariantSchema),
    controller.addVariant
  )

  router.put(
    '/products/:id/variants/:variantId',
    authenticate,
    requirePermissions('products.update'),
    validateBody(updateVariantSchema),
    controller.updateVariant
  )

  router.delete(
    '/products/:id/variants/:variantId',
    authenticate,
    requirePermissions('products.update'),
    controller.deleteVariant
  )

  router.put(
    '/products/:id/variants/:variantId/inventory',
    authenticate,
    requirePermissions('products.update'),
    validateBody(updateInventorySchema),
    controller.updateInventory
  )

  // Categories management
  router.post(
    '/categories',
    authenticate,
    requirePermissions('products.create'),
    validateBody(createCategorySchema),
    controller.createCategory
  )

  router.put(
    '/categories/:id',
    authenticate,
    requirePermissions('products.update'),
    validateParams(idParamSchema),
    validateBody(updateCategorySchema),
    controller.updateCategory
  )

  router.delete(
    '/categories/:id',
    authenticate,
    requirePermissions('products.delete'),
    validateParams(idParamSchema),
    controller.deleteCategory
  )

  // Images
  router.post(
    '/products/:id/images',
    authenticate,
    requirePermissions('products.update'),
    validateParams(idParamSchema),
    validateBody(createImageSchema),
    controller.addImage
  )

  router.delete(
    '/products/:id/images/:imageId',
    authenticate,
    requirePermissions('products.update'),
    controller.deleteImage
  )

  router.put(
    '/products/:id/images/reorder',
    authenticate,
    requirePermissions('products.update'),
    validateParams(idParamSchema),
    validateBody(reorderImagesSchema),
    controller.reorderImages
  )

  // Error handler
  router.use(errorHandler)

  return router
}

// ============================================
// Exports
// ============================================

export { createProductService, ProductService }
export { createProductController, ProductController }
