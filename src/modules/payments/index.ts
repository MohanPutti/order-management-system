// ============================================
// Payment Management Module
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js'
import { getEventBus } from '../../shared/events/index.js'
import { sendSuccess } from '../../shared/utils/index.js'
import {
  validateBody,
  validateParams,
  createAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'

// ============================================
// Types - Re-export from types.ts
// ============================================

export * from './types.js'
export type {
  Payment,
  PaymentProvider,
  PaymentStatus,
  Refund,
  CreatePaymentInput,
  CreatePaymentServiceInput,
  PaymentAdapter,
  UPIPaymentAdapter,
  CardPaymentAdapter,
  PaymentModuleConfig,
} from './types.js'

// ============================================
// Adapters - Re-export from adapters
// ============================================

export * from './adapters/index.js'

// Import types for internal use
import type {
  Payment,
  PaymentProvider,
  CreatePaymentServiceInput,
  PaymentModuleConfig,
  Refund,
} from './types.js'

// ============================================
// Validators
// ============================================

export const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  providerId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  method: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const capturePaymentSchema = z.object({
  paymentId: z.string().uuid(),
})

export const refundPaymentSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid(),
})

// ============================================
// Service
// ============================================

export class PaymentService {
  private prisma: PrismaClient
  private config: PaymentModuleConfig
  private eventBus = getEventBus()

  constructor(prisma: PrismaClient, config: PaymentModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  async findById(id: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({ where: { id } })
    return payment as Payment | null
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    const payments = await this.prisma.payment.findMany({ where: { orderId } })
    return payments as Payment[]
  }

  async create(data: CreatePaymentServiceInput): Promise<Payment> {
    const provider = await this.prisma.paymentProvider.findUnique({
      where: { id: data.providerId },
    })
    if (!provider || !provider.isActive) {
      throw new BadRequestError('Payment provider not available')
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        providerId: data.providerId,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        metadata: data.metadata as object | undefined,
        status: 'pending',
      },
    })

    this.eventBus.emit('payment.initiated', {
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
    })

    return payment as Payment
  }

  async capture(id: string): Promise<Payment> {
    const payment = await this.findById(id)
    if (!payment) throw new NotFoundError('Payment not found')
    if (payment.status !== 'pending') {
      throw new BadRequestError('Payment cannot be captured')
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'completed', paidAt: new Date() },
    })

    this.eventBus.emit('payment.completed', { paymentId: id, orderId: payment.orderId })

    if (this.config.hooks?.onPaymentCompleted) {
      await this.config.hooks.onPaymentCompleted(updated as Payment)
    }

    return updated as Payment
  }

  async fail(id: string, error: string): Promise<Payment> {
    const payment = await this.findById(id)
    if (!payment) throw new NotFoundError('Payment not found')

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'failed', failedAt: new Date() },
    })

    this.eventBus.emit('payment.failed', { paymentId: id, orderId: payment.orderId, reason: error })

    if (this.config.hooks?.onPaymentFailed) {
      await this.config.hooks.onPaymentFailed(updated as Payment, error)
    }

    return updated as Payment
  }

  async refund(id: string, amount?: number, reason?: string): Promise<Payment> {
    const payment = await this.findById(id)
    if (!payment) throw new NotFoundError('Payment not found')
    if (payment.status !== 'completed') {
      throw new BadRequestError('Only completed payments can be refunded')
    }

    const refundAmount = amount || payment.amount

    const refund = await this.prisma.refund.create({
      data: {
        paymentId: id,
        amount: refundAmount,
        reason,
        status: 'completed',
      },
    })

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'refunded', refundedAt: new Date() },
    })

    this.eventBus.emit('payment.refunded', { paymentId: id, amount: refundAmount })

    if (this.config.hooks?.onRefundCompleted) {
      await this.config.hooks.onRefundCompleted(updated as Payment, refund as Refund)
    }

    return updated as Payment
  }

  async getProviders(): Promise<PaymentProvider[]> {
    const providers = await this.prisma.paymentProvider.findMany({
      where: { isActive: true },
    })
    return providers as PaymentProvider[]
  }
}

export function createPaymentService(prisma: PrismaClient, config: PaymentModuleConfig): PaymentService {
  return new PaymentService(prisma, config)
}

// ============================================
// Controller
// ============================================

export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payments = await this.paymentService.findByOrderId(req.query.orderId as string)
      sendSuccess(res, payments)
    } catch (error) {
      next(error)
    }
  }

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.paymentService.findById(req.params.id)
      if (!payment) throw new NotFoundError('Payment not found')
      sendSuccess(res, payment)
    } catch (error) {
      next(error)
    }
  }

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.paymentService.create(req.body)
      sendSuccess(res, payment, 201)
    } catch (error) {
      next(error)
    }
  }

  capture = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.paymentService.capture(req.params.id)
      sendSuccess(res, payment)
    } catch (error) {
      next(error)
    }
  }

  refund = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payment = await this.paymentService.refund(req.params.id, req.body.amount, req.body.reason)
      sendSuccess(res, payment)
    } catch (error) {
      next(error)
    }
  }

  getProviders = async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const providers = await this.paymentService.getProviders()
      sendSuccess(res, providers)
    } catch (error) {
      next(error)
    }
  }
}

export function createPaymentController(paymentService: PaymentService): PaymentController {
  return new PaymentController(paymentService)
}

// ============================================
// Router
// ============================================

export interface CreatePaymentRouterOptions {
  prisma: PrismaClient
  config: PaymentModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createPaymentRouter(options: CreatePaymentRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const paymentService = createPaymentService(prisma, config)
  const controller = createPaymentController(paymentService)

  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  // Public
  router.get('/payment-providers', controller.getProviders)

  // Protected
  router.get('/payments', authenticate, controller.list)
  router.get('/payments/:id', authenticate, validateParams(idParamSchema), controller.getById)
  router.post('/payments', authenticate, validateBody(createPaymentSchema), controller.create)
  router.post('/payments/:id/capture', authenticate, requirePermissions('payments.update'), validateParams(idParamSchema), controller.capture)
  router.post('/payments/:id/refund', authenticate, requirePermissions('payments.update'), validateParams(idParamSchema), validateBody(refundPaymentSchema), controller.refund)

  router.use(errorHandler)
  return router
}

// ============================================
// Quick Setup
// ============================================

export function setupPaymentModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  adapters?: PaymentModuleConfig['adapters']
  hooks?: PaymentModuleConfig['hooks']
}): Router {
  return createPaymentRouter({
    prisma: options.prisma,
    config: { adapters: options.adapters, hooks: options.hooks },
    verifyToken: options.verifyToken,
  })
}
