import { PrismaClient } from '@prisma/client'
import {
  Order,
  OrderWithRelations,
  OrderItem,
  OrderEvent,
  CreateOrderInput,
  UpdateOrderInput,
  AddOrderEventInput,
  OrderModuleConfig,
  OrderQueryParams,
  OrderTotals,
  OrderStatus,
  PaymentStatus,
} from './types.js'
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js'
import { getEventBus } from '../../shared/events/index.js'
import { generateRandomString } from '../../shared/utils/index.js'

// ============================================
// Order Service
// ============================================

export class OrderService {
  private prisma: PrismaClient
  private config: OrderModuleConfig
  private eventBus = getEventBus()

  constructor(prisma: PrismaClient, config: OrderModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  // ==========================================
  // Order CRUD
  // ==========================================

  async findById(id: string): Promise<OrderWithRelations | null> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        fulfillments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    })
    return order as OrderWithRelations | null
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderWithRelations | null> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        payments: true,
        fulfillments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    })
    return order as OrderWithRelations | null
  }

  async findMany(params: OrderQueryParams): Promise<{ data: OrderWithRelations[]; total: number }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      userId,
      status,
      paymentStatus,
      fulfillmentStatus,
      search,
      dateFrom,
      dateTo,
    } = params

    const where: Record<string, unknown> = {}

    if (userId) where.userId = userId
    if (status) where.status = status
    if (paymentStatus) where.paymentStatus = paymentStatus
    if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus

    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { email: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = dateFrom
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = dateTo
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          items: true,
          payments: true,
          fulfillments: true,
          events: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      }),
      this.prisma.order.count({ where }),
    ])

    return { data: data as OrderWithRelations[], total }
  }

  async create(data: CreateOrderInput): Promise<OrderWithRelations> {
    // Generate order number
    const orderNumber = this.generateOrderNumber()

    // Calculate totals
    const totals = this.calculateTotals(data.items)

    // Run beforeCreate hook
    let orderData = { ...data }
    if (this.config.hooks?.beforeCreate) {
      orderData = await this.config.hooks.beforeCreate(orderData)
    }

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId: orderData.userId,
        email: orderData.email,
        status: 'pending',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        shipping: totals.shipping,
        total: totals.total,
        shippingAddress: orderData.shippingAddress as object,
        billingAddress: orderData.billingAddress as object | undefined,
        notes: orderData.notes,
        metadata: orderData.metadata as object | undefined,
        items: {
          create: orderData.items.map((item) => ({
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price,
          })),
        },
        events: this.config.features?.trackEvents !== false
          ? {
              create: {
                type: 'order_created',
                data: { email: orderData.email },
              },
            }
          : undefined,
      },
      include: {
        items: true,
        payments: true,
        fulfillments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    })

    // Emit event
    this.eventBus.emit('order.created', {
      orderId: order.id,
      userId: order.userId || '',
      total: Number(order.total),
    })

    // Run afterCreate hook
    if (this.config.hooks?.afterCreate) {
      await this.config.hooks.afterCreate(order as OrderWithRelations)
    }

    return order as OrderWithRelations
  }

  async update(id: string, data: UpdateOrderInput): Promise<OrderWithRelations> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new NotFoundError('Order not found')
    }

    // Check if editing is allowed
    if (this.config.features?.allowEdit === false && data.status === undefined) {
      throw new BadRequestError('Order editing is disabled')
    }

    const oldStatus = existing.status
    const oldPaymentStatus = existing.paymentStatus

    // Run beforeUpdate hook
    let updateData = { ...data }
    if (this.config.hooks?.beforeUpdate) {
      updateData = await this.config.hooks.beforeUpdate(id, updateData)
    }

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: updateData.status,
        paymentStatus: updateData.paymentStatus,
        notes: updateData.notes,
        metadata: updateData.metadata as object | undefined,
      },
      include: {
        items: true,
        payments: true,
        fulfillments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    })

    // Track status change event
    if (updateData.status && updateData.status !== oldStatus && this.config.features?.trackEvents !== false) {
      await this.addEvent(id, {
        type: 'status_changed',
        data: { from: oldStatus, to: updateData.status },
      })
    }

    // Emit events
    if (updateData.status && updateData.status !== oldStatus) {
      this.eventBus.emit('order.updated', { orderId: id, status: updateData.status })

      // Status change hook
      if (this.config.hooks?.onStatusChange) {
        await this.config.hooks.onStatusChange(id, oldStatus, updateData.status)
      }

      // Specific status hooks
      if (updateData.status === 'confirmed' && this.config.hooks?.onOrderConfirmed) {
        await this.config.hooks.onOrderConfirmed(order as Order)
      }
      if (updateData.status === 'shipped' && this.config.hooks?.onOrderShipped) {
        await this.config.hooks.onOrderShipped(order as Order)
      }
      if (updateData.status === 'delivered' && this.config.hooks?.onOrderDelivered) {
        await this.config.hooks.onOrderDelivered(order as Order)
      }
    }

    // Payment status change hook
    if (updateData.paymentStatus && updateData.paymentStatus !== oldPaymentStatus) {
      if (this.config.hooks?.onPaymentStatusChange) {
        await this.config.hooks.onPaymentStatusChange(id, oldPaymentStatus, updateData.paymentStatus)
      }

      // Auto-confirm on payment
      if (
        updateData.paymentStatus === 'paid' &&
        this.config.autoTransitions?.confirmOnPayment &&
        existing.status === 'pending'
      ) {
        await this.confirm(id)
      }
    }

    return order as OrderWithRelations
  }

  // ==========================================
  // Status Management
  // ==========================================

  async confirm(id: string): Promise<OrderWithRelations> {
    const order = await this.findById(id)
    if (!order) {
      throw new NotFoundError('Order not found')
    }

    if (order.status !== 'pending') {
      throw new BadRequestError('Order can only be confirmed from pending status')
    }

    return this.update(id, { status: 'confirmed' })
  }

  async cancel(id: string, reason?: string): Promise<OrderWithRelations> {
    const order = await this.findById(id)
    if (!order) {
      throw new NotFoundError('Order not found')
    }

    if (this.config.features?.allowCancel === false) {
      throw new BadRequestError('Order cancellation is disabled')
    }

    if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
      throw new BadRequestError(`Cannot cancel order with status: ${order.status}`)
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
      include: {
        items: true,
        payments: true,
        fulfillments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    })

    // Track event
    if (this.config.features?.trackEvents !== false) {
      await this.addEvent(id, {
        type: 'order_cancelled',
        data: { reason },
      })
    }

    // Emit event
    this.eventBus.emit('order.cancelled', { orderId: id, reason })

    // Hook
    if (this.config.hooks?.onOrderCancelled) {
      await this.config.hooks.onOrderCancelled(updated as Order, reason)
    }

    return updated as OrderWithRelations
  }

  // ==========================================
  // Events
  // ==========================================

  async addEvent(orderId: string, event: AddOrderEventInput): Promise<OrderEvent> {
    const order = await this.findById(orderId)
    if (!order) {
      throw new NotFoundError('Order not found')
    }

    const created = await this.prisma.orderEvent.create({
      data: {
        orderId,
        type: event.type,
        data: event.data as object | undefined,
        note: event.note,
        createdBy: event.createdBy,
      },
    })

    return created as OrderEvent
  }

  async getEvents(orderId: string): Promise<OrderEvent[]> {
    const events = await this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    })
    return events as OrderEvent[]
  }

  // ==========================================
  // Calculations
  // ==========================================

  calculateTotals(
    items: { quantity: number; price: number }[],
    discount: number = 0,
    taxRate: number = 0,
    shippingCost: number = 0
  ): OrderTotals {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
    const discountAmount = discount
    const taxableAmount = subtotal - discountAmount
    const tax = taxableAmount * taxRate
    const total = taxableAmount + tax + shippingCost

    return {
      subtotal,
      discount: discountAmount,
      tax,
      shipping: shippingCost,
      total: Math.max(0, total),
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private generateOrderNumber(): string {
    const prefix = this.config.orderNumber?.prefix || 'ORD'
    const length = this.config.orderNumber?.length || 8
    const random = generateRandomString(length).toUpperCase()
    return `${prefix}-${random}`
  }
}

// ============================================
// Factory Function
// ============================================

export function createOrderService(
  prisma: PrismaClient,
  config: OrderModuleConfig
): OrderService {
  return new OrderService(prisma, config)
}
