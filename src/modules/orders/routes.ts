import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { OrderService, createOrderService } from './service.js'
import { OrderController, createOrderController } from './controller.js'
import { OrderModuleConfig } from './types.js'
import {
  validateBody,
  validateQuery,
  validateParams,
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'
import {
  createOrderSchema,
  updateOrderSchema,
  addEventSchema,
  cancelOrderSchema,
  orderQuerySchema,
  idParamSchema,
  orderNumberParamSchema,
} from './validators.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'

// ============================================
// Order Routes Factory
// ============================================

export interface CreateOrderRouterOptions {
  prisma: PrismaClient
  config: OrderModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createOrderRouter(options: CreateOrderRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const orderService = createOrderService(prisma, config)
  const controller = createOrderController(orderService)

  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  const optionalAuth = verifyToken
    ? createOptionalAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  if (config.middleware) {
    config.middleware.forEach((mw) => router.use(mw))
  }

  // ==========================================
  // Routes
  // ==========================================

  // List orders (auth required, filtered by ownership)
  router.get('/orders', authenticate, validateQuery(orderQuerySchema), controller.list)

  // Get by ID (auth required, ownership check)
  router.get('/orders/:id', authenticate, validateParams(idParamSchema), controller.getById)

  // Get by order number (optional auth, email check for guests)
  router.get(
    '/orders/number/:orderNumber',
    optionalAuth,
    validateParams(orderNumberParamSchema),
    controller.getByOrderNumber
  )

  // Create order (optional auth - guests can checkout)
  router.post('/orders', optionalAuth, validateBody(createOrderSchema), controller.create)

  // Update order (admin only)
  router.put(
    '/orders/:id',
    authenticate,
    requirePermissions('orders.update'),
    validateParams(idParamSchema),
    validateBody(updateOrderSchema),
    controller.update
  )

  // Confirm order (admin only)
  router.post(
    '/orders/:id/confirm',
    authenticate,
    requirePermissions('orders.update'),
    validateParams(idParamSchema),
    controller.confirm
  )

  // Cancel order (auth required, ownership or admin)
  router.post(
    '/orders/:id/cancel',
    authenticate,
    validateParams(idParamSchema),
    validateBody(cancelOrderSchema),
    controller.cancel
  )

  // Events (admin only)
  router.get(
    '/orders/:id/events',
    authenticate,
    requirePermissions('orders.read'),
    validateParams(idParamSchema),
    controller.getEvents
  )

  router.post(
    '/orders/:id/events',
    authenticate,
    requirePermissions('orders.update'),
    validateParams(idParamSchema),
    validateBody(addEventSchema),
    controller.addEvent
  )

  router.use(errorHandler)

  return router
}

// ============================================
// Exports
// ============================================

export { createOrderService, OrderService }
export { createOrderController, OrderController }
