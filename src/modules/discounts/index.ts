// ============================================
// Discount Management Module
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseModuleConfig, AuthenticatedRequest, MonetaryValue, toNumber } from '../../shared/types/index.js'
import { NotFoundError, ConflictError } from '../../shared/errors/index.js'
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
// Types
// ============================================

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping'

export interface Discount {
  id: string
  code: string
  description: string | null
  type: DiscountType
  value: MonetaryValue
  minPurchase: MonetaryValue | null
  maxUses: number | null
  usedCount: number
  startsAt: Date | null
  endsAt: Date | null
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface DiscountWithConditions extends Discount {
  conditions: DiscountCondition[]
}

export interface DiscountCondition {
  id: string
  discountId: string
  type: string
  operator: string
  value: unknown
}

export interface CreateDiscountInput {
  code: string
  description?: string
  type: DiscountType
  value: number
  minPurchase?: number
  maxUses?: number
  startsAt?: Date
  endsAt?: Date
  isActive?: boolean
  conditions?: CreateConditionInput[]
  metadata?: Record<string, unknown>
}

export interface UpdateDiscountInput {
  code?: string
  description?: string
  type?: DiscountType
  value?: number
  minPurchase?: number
  maxUses?: number
  startsAt?: Date
  endsAt?: Date
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface CreateConditionInput {
  type: string
  operator: string
  value: unknown
}

export interface ValidateDiscountInput {
  code: string
  cartTotal: number
  productIds?: string[]
  categoryIds?: string[]
  customerId?: string
}

export interface DiscountModuleConfig extends BaseModuleConfig {
  hooks?: {
    onDiscountApplied?: (discountId: string, orderId: string) => void | Promise<void>
    onDiscountExpired?: (discountId: string) => void | Promise<void>
  }
}

// ============================================
// Validators
// ============================================

export const discountTypeSchema = z.enum(['percentage', 'fixed_amount', 'free_shipping'])

export const conditionSchema = z.object({
  type: z.string().min(1),
  operator: z.enum(['in', 'not_in', 'equals', 'gte', 'lte']),
  value: z.unknown(),
})

export const createDiscountSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.toUpperCase()),
  description: z.string().max(500).optional(),
  type: discountTypeSchema,
  value: z.number().positive(),
  minPurchase: z.number().min(0).optional(),
  maxUses: z.number().int().positive().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  isActive: z.boolean().optional().default(true),
  conditions: z.array(conditionSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateDiscountSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.toUpperCase()).optional(),
  description: z.string().max(500).nullable().optional(),
  type: discountTypeSchema.optional(),
  value: z.number().positive().optional(),
  minPurchase: z.number().min(0).nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const validateDiscountSchema = z.object({
  code: z.string().min(1),
  cartTotal: z.number().min(0),
  productIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  customerId: z.string().uuid().optional(),
})

export const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  search: z.string().optional(),
  type: discountTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })

// ============================================
// Service
// ============================================

export class DiscountService {
  private prisma: PrismaClient
  private config: DiscountModuleConfig

  constructor(prisma: PrismaClient, config: DiscountModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  async findById(id: string): Promise<DiscountWithConditions | null> {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: { conditions: true },
    })
    return discount as DiscountWithConditions | null
  }

  async findByCode(code: string): Promise<DiscountWithConditions | null> {
    const discount = await this.prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
      include: { conditions: true },
    })
    return discount as DiscountWithConditions | null
  }

  async findMany(params: {
    page?: number
    limit?: number
    search?: string
    type?: DiscountType
    isActive?: boolean
  }): Promise<{ data: DiscountWithConditions[]; total: number }> {
    const { page = 1, limit = 10, search, type, isActive } = params
    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { description: { contains: search } },
      ]
    }
    if (type) where.type = type
    if (isActive !== undefined) where.isActive = isActive

    const [data, total] = await Promise.all([
      this.prisma.discount.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { conditions: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.discount.count({ where }),
    ])

    return { data: data as DiscountWithConditions[], total }
  }

  async create(data: CreateDiscountInput): Promise<DiscountWithConditions> {
    const existing = await this.findByCode(data.code)
    if (existing) throw new ConflictError('Discount code already exists')

    const discount = await this.prisma.discount.create({
      data: {
        code: data.code.toUpperCase(),
        description: data.description,
        type: data.type,
        value: data.value,
        minPurchase: data.minPurchase,
        maxUses: data.maxUses,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        isActive: data.isActive ?? true,
        metadata: data.metadata as object | undefined,
        conditions: data.conditions
          ? { create: data.conditions.map((c) => ({ ...c, value: c.value as object })) }
          : undefined,
      },
      include: { conditions: true },
    })

    return discount as DiscountWithConditions
  }

  async update(id: string, data: UpdateDiscountInput): Promise<DiscountWithConditions> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError('Discount not found')

    if (data.code && data.code !== existing.code) {
      const codeExists = await this.findByCode(data.code)
      if (codeExists) throw new ConflictError('Discount code already exists')
    }

    const discount = await this.prisma.discount.update({
      where: { id },
      data: {
        code: data.code?.toUpperCase(),
        description: data.description,
        type: data.type,
        value: data.value,
        minPurchase: data.minPurchase,
        maxUses: data.maxUses,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        isActive: data.isActive,
        metadata: data.metadata as object | undefined,
      },
      include: { conditions: true },
    })

    return discount as DiscountWithConditions
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) throw new NotFoundError('Discount not found')

    await this.prisma.discount.delete({ where: { id } })
  }

  async validate(input: ValidateDiscountInput): Promise<{
    valid: boolean
    discount?: DiscountWithConditions
    discountAmount?: number
    error?: string
  }> {
    const discount = await this.findByCode(input.code)
    if (!discount) return { valid: false, error: 'Discount code not found' }
    if (!discount.isActive) return { valid: false, error: 'Discount is not active' }

    const now = new Date()
    if (discount.startsAt && discount.startsAt > now) {
      return { valid: false, error: 'Discount is not yet active' }
    }
    if (discount.endsAt && discount.endsAt < now) {
      return { valid: false, error: 'Discount has expired' }
    }
    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      return { valid: false, error: 'Discount usage limit reached' }
    }
    if (discount.minPurchase && input.cartTotal < Number(discount.minPurchase)) {
      return { valid: false, error: `Minimum purchase of ${discount.minPurchase} required` }
    }

    // Calculate discount amount
    let discountAmount = 0
    const discountValue = toNumber(discount.value)
    if (discount.type === 'percentage') {
      discountAmount = input.cartTotal * (discountValue / 100)
    } else if (discount.type === 'fixed_amount') {
      discountAmount = Math.min(discountValue, input.cartTotal)
    }

    return { valid: true, discount, discountAmount }
  }

  async incrementUsage(id: string): Promise<void> {
    await this.prisma.discount.update({
      where: { id },
      data: { usedCount: { increment: 1 } },
    })
  }

  async addCondition(discountId: string, condition: CreateConditionInput): Promise<DiscountCondition> {
    const discount = await this.findById(discountId)
    if (!discount) throw new NotFoundError('Discount not found')

    const created = await this.prisma.discountCondition.create({
      data: {
        discountId,
        type: condition.type,
        operator: condition.operator,
        value: condition.value as object,
      },
    })

    return created as DiscountCondition
  }

  async removeCondition(conditionId: string): Promise<void> {
    await this.prisma.discountCondition.delete({ where: { id: conditionId } })
  }
}

export function createDiscountService(prisma: PrismaClient, config: DiscountModuleConfig): DiscountService {
  return new DiscountService(prisma, config)
}

// ============================================
// Controller
// ============================================

export class DiscountController {
  constructor(private discountService: DiscountService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, total } = await this.discountService.findMany(req.query as Record<string, unknown>)
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
      const discount = await this.discountService.findById(req.params.id)
      if (!discount) throw new NotFoundError('Discount not found')
      sendSuccess(res, discount)
    } catch (error) {
      next(error)
    }
  }

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const discount = await this.discountService.create(req.body)
      sendSuccess(res, discount, 201)
    } catch (error) {
      next(error)
    }
  }

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const discount = await this.discountService.update(req.params.id, req.body)
      sendSuccess(res, discount)
    } catch (error) {
      next(error)
    }
  }

  delete = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.discountService.delete(req.params.id)
      sendSuccess(res, { message: 'Discount deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  validate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.discountService.validate(req.body)
      sendSuccess(res, result)
    } catch (error) {
      next(error)
    }
  }
}

export function createDiscountController(service: DiscountService): DiscountController {
  return new DiscountController(service)
}

// ============================================
// Router
// ============================================

export interface CreateDiscountRouterOptions {
  prisma: PrismaClient
  config: DiscountModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createDiscountRouter(options: CreateDiscountRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const service = createDiscountService(prisma, config)
  const controller = createDiscountController(service)

  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  // Public
  router.post('/discounts/validate', validateBody(validateDiscountSchema), controller.validate)

  // Protected
  router.get('/discounts', authenticate, requirePermissions('discounts.read'), validateQuery(querySchema), controller.list)
  router.get('/discounts/:id', authenticate, requirePermissions('discounts.read'), validateParams(idParamSchema), controller.getById)
  router.post('/discounts', authenticate, requirePermissions('discounts.create'), validateBody(createDiscountSchema), controller.create)
  router.put('/discounts/:id', authenticate, requirePermissions('discounts.update'), validateParams(idParamSchema), validateBody(updateDiscountSchema), controller.update)
  router.delete('/discounts/:id', authenticate, requirePermissions('discounts.delete'), validateParams(idParamSchema), controller.delete)

  router.use(errorHandler)
  return router
}

// ============================================
// Quick Setup
// ============================================

export function setupDiscountModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  hooks?: DiscountModuleConfig['hooks']
}): Router {
  return createDiscountRouter({
    prisma: options.prisma,
    config: { hooks: options.hooks },
    verifyToken: options.verifyToken,
  })
}
