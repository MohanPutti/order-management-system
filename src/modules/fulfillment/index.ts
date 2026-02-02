// ============================================
// Fulfillment Management Module
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js'
import { getEventBus } from '../../shared/events/index.js'
import { sendSuccess, sendPaginated } from '../../shared/utils/index.js'
import {
  validateBody,
  validateParams,
  validateQuery,
  createAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'

// ============================================
// Types - Re-export from types.ts
// ============================================

export * from './types.js'

// ============================================
// Adapters - Re-export from adapters
// ============================================

export * from './adapters/index.js'

// Import types for internal use
import type {
  Fulfillment,
  FulfillmentWithItems,
  FulfillmentItem,
  ShippingProvider,
  CreateFulfillmentInput,
  ShipFulfillmentInput,
  FulfillmentModuleConfig,
  FulfillmentStatus,
} from './types.js'

// ============================================
// Validators
// ============================================

export const createFulfillmentSchema = z.object({
  orderId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  metadata: z.record(z.unknown()).optional(),
})

export const shipFulfillmentSchema = z.object({
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().url().optional(),
  carrier: z.string().optional(),
})

export const updateStatusSchema = z.object({
  status: z.enum(['pending', 'shipped', 'in_transit', 'delivered', 'failed']),
})

export const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  orderId: z.string().uuid().optional(),
  status: z.enum(['pending', 'shipped', 'in_transit', 'delivered', 'failed']).optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })

// ============================================
// Service
// ============================================

export class FulfillmentService {
  private prisma: PrismaClient
  private config: FulfillmentModuleConfig
  private eventBus = getEventBus()

  constructor(prisma: PrismaClient, config: FulfillmentModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  async findById(id: string): Promise<FulfillmentWithItems | null> {
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { id },
      include: { items: true },
    })
    return fulfillment as FulfillmentWithItems | null
  }

  async findMany(params: {
    page?: number
    limit?: number
    orderId?: string
    status?: FulfillmentStatus
  }): Promise<{ data: FulfillmentWithItems[]; total: number }> {
    const { page = 1, limit = 10, orderId, status } = params
    const where: Record<string, unknown> = {}
    if (orderId) where.orderId = orderId
    if (status) where.status = status

    const [data, total] = await Promise.all([
      this.prisma.fulfillment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fulfillment.count({ where }),
    ])

    return { data: data as FulfillmentWithItems[], total }
  }

  async create(data: CreateFulfillmentInput): Promise<FulfillmentWithItems> {
    // Validate order exists
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      include: { items: true },
    })
    if (!order) throw new NotFoundError('Order not found')

    // Validate items
    for (const item of data.items) {
      const orderItem = order.items.find((oi) => oi.id === item.orderItemId)
      if (!orderItem) throw new BadRequestError(`Order item ${item.orderItemId} not found`)
      if (item.quantity > orderItem.quantity - orderItem.fulfilledQty) {
        throw new BadRequestError(`Cannot fulfill more than ordered quantity for item ${item.orderItemId}`)
      }
    }

    const fulfillment = await this.prisma.fulfillment.create({
      data: {
        orderId: data.orderId,
        providerId: data.providerId,
        status: 'pending',
        metadata: data.metadata as object | undefined,
        items: {
          create: data.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    })

    // Update order item fulfilled quantities
    for (const item of data.items) {
      await this.prisma.orderItem.update({
        where: { id: item.orderItemId },
        data: { fulfilledQty: { increment: item.quantity } },
      })
    }

    // Update order fulfillment status
    await this.updateOrderFulfillmentStatus(data.orderId)

    this.eventBus.emit('fulfillment.created', { fulfillmentId: fulfillment.id, orderId: data.orderId })

    if (this.config.hooks?.onFulfillmentCreated) {
      await this.config.hooks.onFulfillmentCreated(fulfillment as Fulfillment)
    }

    return fulfillment as FulfillmentWithItems
  }

  async ship(id: string, data: ShipFulfillmentInput): Promise<FulfillmentWithItems> {
    const fulfillment = await this.findById(id)
    if (!fulfillment) throw new NotFoundError('Fulfillment not found')
    if (fulfillment.status !== 'pending') {
      throw new BadRequestError('Fulfillment has already been shipped')
    }

    const updated = await this.prisma.fulfillment.update({
      where: { id },
      data: {
        status: 'shipped',
        trackingNumber: data.trackingNumber,
        trackingUrl: data.trackingUrl,
        carrier: data.carrier,
        shippedAt: new Date(),
      },
      include: { items: true },
    })

    this.eventBus.emit('fulfillment.shipped', {
      fulfillmentId: id,
      trackingNumber: data.trackingNumber || '',
    })

    if (this.config.hooks?.onFulfillmentShipped) {
      await this.config.hooks.onFulfillmentShipped(updated as Fulfillment)
    }

    return updated as FulfillmentWithItems
  }

  async updateStatus(id: string, status: FulfillmentStatus): Promise<FulfillmentWithItems> {
    const fulfillment = await this.findById(id)
    if (!fulfillment) throw new NotFoundError('Fulfillment not found')

    const updateData: Record<string, unknown> = { status }
    if (status === 'delivered') {
      updateData.deliveredAt = new Date()
    }

    const updated = await this.prisma.fulfillment.update({
      where: { id },
      data: updateData,
      include: { items: true },
    })

    if (status === 'delivered') {
      this.eventBus.emit('fulfillment.delivered', { fulfillmentId: id })
      if (this.config.hooks?.onFulfillmentDelivered) {
        await this.config.hooks.onFulfillmentDelivered(updated as Fulfillment)
      }
      await this.updateOrderFulfillmentStatus(fulfillment.orderId)
    }

    return updated as FulfillmentWithItems
  }

  async getProviders(): Promise<ShippingProvider[]> {
    const providers = await this.prisma.shippingProvider.findMany({
      where: { isActive: true },
    })
    return providers as ShippingProvider[]
  }

  private async updateOrderFulfillmentStatus(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!order) return

    const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0)
    const fulfilledQty = order.items.reduce((sum, i) => sum + i.fulfilledQty, 0)

    let fulfillmentStatus = 'unfulfilled'
    if (fulfilledQty >= totalQty) {
      fulfillmentStatus = 'fulfilled'
    } else if (fulfilledQty > 0) {
      fulfillmentStatus = 'partial'
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus },
    })
  }
}

export function createFulfillmentService(prisma: PrismaClient, config: FulfillmentModuleConfig): FulfillmentService {
  return new FulfillmentService(prisma, config)
}

// ============================================
// Controller
// ============================================

export class FulfillmentController {
  constructor(private fulfillmentService: FulfillmentService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, total } = await this.fulfillmentService.findMany(req.query as Record<string, unknown>)
      sendPaginated(res, data, total, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
      })
    } catch (error) {
      next(error)
    }
  }

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fulfillment = await this.fulfillmentService.findById(req.params.id)
      if (!fulfillment) throw new NotFoundError('Fulfillment not found')
      sendSuccess(res, fulfillment)
    } catch (error) {
      next(error)
    }
  }

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fulfillment = await this.fulfillmentService.create(req.body)
      sendSuccess(res, fulfillment, 201)
    } catch (error) {
      next(error)
    }
  }

  ship = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fulfillment = await this.fulfillmentService.ship(req.params.id, req.body)
      sendSuccess(res, fulfillment)
    } catch (error) {
      next(error)
    }
  }

  updateStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fulfillment = await this.fulfillmentService.updateStatus(req.params.id, req.body.status)
      sendSuccess(res, fulfillment)
    } catch (error) {
      next(error)
    }
  }

  getProviders = async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const providers = await this.fulfillmentService.getProviders()
      sendSuccess(res, providers)
    } catch (error) {
      next(error)
    }
  }
}

export function createFulfillmentController(service: FulfillmentService): FulfillmentController {
  return new FulfillmentController(service)
}

// ============================================
// Router
// ============================================

export interface CreateFulfillmentRouterOptions {
  prisma: PrismaClient
  config: FulfillmentModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createFulfillmentRouter(options: CreateFulfillmentRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const service = createFulfillmentService(prisma, config)
  const controller = createFulfillmentController(service)

  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  router.get('/shipping-providers', controller.getProviders)
  router.get('/fulfillments', authenticate, requirePermissions('fulfillments.read'), validateQuery(querySchema), controller.list)
  router.get('/fulfillments/:id', authenticate, requirePermissions('fulfillments.read'), validateParams(idParamSchema), controller.getById)
  router.post('/fulfillments', authenticate, requirePermissions('fulfillments.create'), validateBody(createFulfillmentSchema), controller.create)
  router.post('/fulfillments/:id/ship', authenticate, requirePermissions('fulfillments.update'), validateParams(idParamSchema), validateBody(shipFulfillmentSchema), controller.ship)
  router.put('/fulfillments/:id/status', authenticate, requirePermissions('fulfillments.update'), validateParams(idParamSchema), validateBody(updateStatusSchema), controller.updateStatus)

  router.use(errorHandler)
  return router
}

// ============================================
// Quick Setup
// ============================================

export function setupFulfillmentModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  adapters?: FulfillmentModuleConfig['adapters']
  hooks?: FulfillmentModuleConfig['hooks']
}): Router {
  return createFulfillmentRouter({
    prisma: options.prisma,
    config: { adapters: options.adapters, hooks: options.hooks },
    verifyToken: options.verifyToken,
  })
}
