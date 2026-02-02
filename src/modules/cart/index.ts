// ============================================
// Cart Management Module
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseModuleConfig, AuthenticatedRequest, MonetaryValue, toNumber } from '../../shared/types/index.js'
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js'
import { getEventBus } from '../../shared/events/index.js'
import { sendSuccess } from '../../shared/utils/index.js'
import {
  validateBody,
  validateParams,
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  errorHandler,
} from '../../shared/middleware/index.js'

// ============================================
// Types
// ============================================

export type CartStatus = 'active' | 'converted' | 'abandoned'

export interface Cart {
  id: string
  userId: string | null
  sessionId: string | null
  status: CartStatus
  currency: string
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date | null
}

export interface CartWithItems extends Cart {
  items: CartItem[]
  discounts: { discount: Discount }[]
  subtotal: number
  total: number
}

export interface CartItem {
  id: string
  cartId: string
  variantId: string
  quantity: number
  price: MonetaryValue
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface Discount {
  id: string
  code: string
  type: string
  value: MonetaryValue
}

export interface AddItemInput {
  variantId: string
  quantity: number
  price?: number
  metadata?: Record<string, unknown>
}

export interface UpdateItemInput {
  quantity: number
}

export interface CartModuleConfig extends BaseModuleConfig {
  /** Cart expiration in days */
  expirationDays?: number
  /** Default currency */
  defaultCurrency?: string
  hooks?: {
    onItemAdded?: (cartId: string, item: CartItem) => void | Promise<void>
    onItemRemoved?: (cartId: string, itemId: string) => void | Promise<void>
    onCartConverted?: (cartId: string, orderId: string) => void | Promise<void>
  }
}

// ============================================
// Validators
// ============================================

export const addItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
  price: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateItemSchema = z.object({
  quantity: z.number().int().min(0),
})

export const applyDiscountSchema = z.object({
  code: z.string().min(1),
})

export const idParamSchema = z.object({
  id: z.string().uuid(),
})

// ============================================
// Service
// ============================================

export class CartService {
  private prisma: PrismaClient
  private config: CartModuleConfig
  private eventBus = getEventBus()

  constructor(prisma: PrismaClient, config: CartModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  async findById(id: string): Promise<CartWithItems | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: {
        items: { include: { variant: true } },
        discounts: { include: { discount: true } },
      },
    })
    if (!cart) return null
    return this.calculateTotals(cart)
  }

  async findByUserId(userId: string): Promise<CartWithItems | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId, status: 'active' },
      include: {
        items: { include: { variant: true } },
        discounts: { include: { discount: true } },
      },
    })
    if (!cart) return null
    return this.calculateTotals(cart)
  }

  async findBySessionId(sessionId: string): Promise<CartWithItems | null> {
    const cart = await this.prisma.cart.findFirst({
      where: { sessionId, status: 'active', userId: null },
      include: {
        items: { include: { variant: true } },
        discounts: { include: { discount: true } },
      },
    })
    if (!cart) return null
    return this.calculateTotals(cart)
  }

  async create(userId?: string, sessionId?: string): Promise<CartWithItems> {
    const expiresAt = this.config.expirationDays
      ? new Date(Date.now() + this.config.expirationDays * 24 * 60 * 60 * 1000)
      : null

    const cart = await this.prisma.cart.create({
      data: {
        userId,
        sessionId,
        status: 'active',
        currency: this.config.defaultCurrency || 'USD',
        expiresAt,
      },
      include: {
        items: { include: { variant: true } },
        discounts: { include: { discount: true } },
      },
    })

    this.eventBus.emit('cart.created', { cartId: cart.id, userId })

    return this.calculateTotals(cart)
  }

  async getOrCreate(userId?: string, sessionId?: string): Promise<CartWithItems> {
    if (userId) {
      const existing = await this.findByUserId(userId)
      if (existing) return existing
    } else if (sessionId) {
      const existing = await this.findBySessionId(sessionId)
      if (existing) return existing
    }
    return this.create(userId, sessionId)
  }

  async addItem(cartId: string, data: AddItemInput): Promise<CartWithItems> {
    const cart = await this.findById(cartId)
    if (!cart) throw new NotFoundError('Cart not found')
    if (cart.status !== 'active') throw new BadRequestError('Cart is not active')

    // Get variant price if not provided
    let price = data.price
    if (!price) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: data.variantId },
      })
      if (!variant) throw new NotFoundError('Product variant not found')
      price = Number(variant.price)
    }

    // Check if item already exists
    const existingItem = cart.items.find((i) => i.variantId === data.variantId)

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + data.quantity },
      })
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId,
          variantId: data.variantId,
          quantity: data.quantity,
          price,
          metadata: data.metadata as object | undefined,
        },
      })
    }

    this.eventBus.emit('cart.itemAdded', { cartId, productId: data.variantId, quantity: data.quantity })

    const updated = await this.findById(cartId)
    return updated!
  }

  async updateItem(cartId: string, itemId: string, data: UpdateItemInput): Promise<CartWithItems> {
    const cart = await this.findById(cartId)
    if (!cart) throw new NotFoundError('Cart not found')

    const item = cart.items.find((i) => i.id === itemId)
    if (!item) throw new NotFoundError('Cart item not found')

    if (data.quantity === 0) {
      return this.removeItem(cartId, itemId)
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: data.quantity },
    })

    const updated = await this.findById(cartId)
    return updated!
  }

  async removeItem(cartId: string, itemId: string): Promise<CartWithItems> {
    const cart = await this.findById(cartId)
    if (!cart) throw new NotFoundError('Cart not found')

    await this.prisma.cartItem.delete({ where: { id: itemId } })

    this.eventBus.emit('cart.itemRemoved', { cartId, productId: itemId })

    if (this.config.hooks?.onItemRemoved) {
      await this.config.hooks.onItemRemoved(cartId, itemId)
    }

    const updated = await this.findById(cartId)
    return updated!
  }

  async applyDiscount(cartId: string, code: string): Promise<CartWithItems> {
    const cart = await this.findById(cartId)
    if (!cart) throw new NotFoundError('Cart not found')

    const discount = await this.prisma.discount.findFirst({
      where: {
        code,
        isActive: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: new Date() } },
        ],
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          { OR: [{ maxUses: null }, { usedCount: { lt: this.prisma.discount.fields.maxUses } }] },
        ],
      },
    })

    if (!discount) throw new BadRequestError('Invalid or expired discount code')

    // Check if already applied
    const existing = cart.discounts.find((d) => d.discount.id === discount.id)
    if (existing) throw new BadRequestError('Discount already applied')

    await this.prisma.cartDiscount.create({
      data: { cartId, discountId: discount.id },
    })

    const updated = await this.findById(cartId)
    return updated!
  }

  async removeDiscount(cartId: string, discountId: string): Promise<CartWithItems> {
    await this.prisma.cartDiscount.deleteMany({
      where: { cartId, discountId },
    })

    const updated = await this.findById(cartId)
    return updated!
  }

  async clear(cartId: string): Promise<CartWithItems> {
    const cart = await this.findById(cartId)
    if (!cart) throw new NotFoundError('Cart not found')

    await this.prisma.cartItem.deleteMany({ where: { cartId } })
    await this.prisma.cartDiscount.deleteMany({ where: { cartId } })

    this.eventBus.emit('cart.cleared', { cartId })

    const updated = await this.findById(cartId)
    return updated!
  }

  async markConverted(cartId: string, orderId: string): Promise<void> {
    await this.prisma.cart.update({
      where: { id: cartId },
      data: { status: 'converted' },
    })

    this.eventBus.emit('cart.converted', { cartId, orderId })

    if (this.config.hooks?.onCartConverted) {
      await this.config.hooks.onCartConverted(cartId, orderId)
    }
  }

  async mergeGuestCart(guestCartId: string, userId: string): Promise<CartWithItems> {
    const guestCart = await this.findById(guestCartId)
    if (!guestCart) throw new NotFoundError('Guest cart not found')

    let userCart = await this.findByUserId(userId)
    if (!userCart) {
      // Assign guest cart to user
      await this.prisma.cart.update({
        where: { id: guestCartId },
        data: { userId, sessionId: null },
      })
      return (await this.findById(guestCartId))!
    }

    // Merge items
    for (const item of guestCart.items) {
      const existing = userCart.items.find((i) => i.variantId === item.variantId)
      if (existing) {
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + item.quantity },
        })
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.price,
          },
        })
      }
    }

    // Delete guest cart
    await this.prisma.cart.delete({ where: { id: guestCartId } })

    return (await this.findById(userCart.id))!
  }

  private calculateTotals(cart: Record<string, unknown>): CartWithItems {
    const items = (cart as { items: CartItem[] }).items || []
    const discounts = (cart as { discounts: { discount: Discount }[] }).discounts || []

    const subtotal = items.reduce((sum, item) => sum + toNumber(item.price) * item.quantity, 0)

    let discountAmount = 0
    for (const { discount } of discounts) {
      const discountValue = toNumber(discount.value)
      if (discount.type === 'percentage') {
        discountAmount += subtotal * (discountValue / 100)
      } else if (discount.type === 'fixed_amount') {
        discountAmount += discountValue
      }
    }

    const total = Math.max(0, subtotal - discountAmount)

    return {
      ...(cart as Cart),
      items,
      discounts,
      subtotal,
      total,
    } as CartWithItems
  }
}

export function createCartService(prisma: PrismaClient, config: CartModuleConfig): CartService {
  return new CartService(prisma, config)
}

// ============================================
// Controller
// ============================================

export class CartController {
  constructor(private cartService: CartService) {}

  get = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await this.cartService.getOrCreate(
        req.user?.id,
        req.headers['x-session-id'] as string
      )
      sendSuccess(res, cart)
    } catch (error) {
      next(error)
    }
  }

  addItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await this.cartService.getOrCreate(
        req.user?.id,
        req.headers['x-session-id'] as string
      )
      const updated = await this.cartService.addItem(cart.id, req.body)
      sendSuccess(res, updated)
    } catch (error) {
      next(error)
    }
  }

  updateItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await this.cartService.findById(req.params.cartId)
      if (!cart) throw new NotFoundError('Cart not found')
      const updated = await this.cartService.updateItem(cart.id, req.params.itemId, req.body)
      sendSuccess(res, updated)
    } catch (error) {
      next(error)
    }
  }

  removeItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await this.cartService.findById(req.params.cartId)
      if (!cart) throw new NotFoundError('Cart not found')
      const updated = await this.cartService.removeItem(cart.id, req.params.itemId)
      sendSuccess(res, updated)
    } catch (error) {
      next(error)
    }
  }

  applyDiscount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cart = await this.cartService.getOrCreate(
        req.user?.id,
        req.headers['x-session-id'] as string
      )
      const updated = await this.cartService.applyDiscount(cart.id, req.body.code)
      sendSuccess(res, updated)
    } catch (error) {
      next(error)
    }
  }

  removeDiscount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.cartService.removeDiscount(req.params.cartId, req.params.discountId)
      sendSuccess(res, updated)
    } catch (error) {
      next(error)
    }
  }

  clear = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.cartService.clear(req.params.id)
      sendSuccess(res, updated)
    } catch (error) {
      next(error)
    }
  }
}

export function createCartController(cartService: CartService): CartController {
  return new CartController(cartService)
}

// ============================================
// Router
// ============================================

export interface CreateCartRouterOptions {
  prisma: PrismaClient
  config: CartModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createCartRouter(options: CreateCartRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const cartService = createCartService(prisma, config)
  const controller = createCartController(cartService)

  const optionalAuth = verifyToken
    ? createOptionalAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  // All cart routes support both guest and authenticated users
  router.get('/cart', optionalAuth, controller.get)
  router.post('/cart/items', optionalAuth, validateBody(addItemSchema), controller.addItem)
  router.put('/cart/:cartId/items/:itemId', optionalAuth, validateBody(updateItemSchema), controller.updateItem)
  router.delete('/cart/:cartId/items/:itemId', optionalAuth, controller.removeItem)
  router.post('/cart/discount', optionalAuth, validateBody(applyDiscountSchema), controller.applyDiscount)
  router.delete('/cart/:cartId/discount/:discountId', optionalAuth, controller.removeDiscount)
  router.delete('/cart/:id', optionalAuth, validateParams(idParamSchema), controller.clear)

  router.use(errorHandler)
  return router
}

// ============================================
// Quick Setup
// ============================================

export function setupCartModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  expirationDays?: number
  defaultCurrency?: string
  hooks?: CartModuleConfig['hooks']
}): Router {
  return createCartRouter({
    prisma: options.prisma,
    config: {
      expirationDays: options.expirationDays || 30,
      defaultCurrency: options.defaultCurrency || 'USD',
      hooks: options.hooks,
    },
    verifyToken: options.verifyToken,
  })
}
