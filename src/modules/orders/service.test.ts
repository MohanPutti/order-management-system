import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrderService } from './service.js'
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js'

// Mock PrismaClient
const mockPrisma = {
  order: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  orderEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}

// Mock event bus
vi.mock('../../shared/events/index.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
  }),
}))

describe('OrderService', () => {
  let service: OrderService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new OrderService(mockPrisma as any, {})
  })

  describe('calculateTotals', () => {
    it('should calculate subtotal from items', () => {
      const items = [
        { quantity: 2, price: 10 },
        { quantity: 1, price: 25 },
      ]
      const result = service.calculateTotals(items)
      expect(result.subtotal).toBe(45) // 2*10 + 1*25
    })

    it('should apply discount', () => {
      const items = [{ quantity: 2, price: 50 }]
      const result = service.calculateTotals(items, 20)
      expect(result.subtotal).toBe(100)
      expect(result.discount).toBe(20)
      expect(result.total).toBe(80)
    })

    it('should calculate tax on discounted amount', () => {
      const items = [{ quantity: 1, price: 100 }]
      const result = service.calculateTotals(items, 10, 0.1) // 10% tax
      // Taxable: 100 - 10 = 90
      // Tax: 90 * 0.1 = 9
      // Total: 90 + 9 = 99
      expect(result.tax).toBe(9)
      expect(result.total).toBe(99)
    })

    it('should add shipping cost', () => {
      const items = [{ quantity: 1, price: 50 }]
      const result = service.calculateTotals(items, 0, 0, 10)
      expect(result.shipping).toBe(10)
      expect(result.total).toBe(60)
    })

    it('should calculate complete totals', () => {
      const items = [
        { quantity: 2, price: 100 }, // 200
        { quantity: 3, price: 50 },  // 150
      ]
      // Subtotal: 350
      // Discount: 50
      // Taxable: 300
      // Tax (10%): 30
      // Shipping: 15
      // Total: 300 + 30 + 15 = 345
      const result = service.calculateTotals(items, 50, 0.1, 15)
      expect(result.subtotal).toBe(350)
      expect(result.discount).toBe(50)
      expect(result.tax).toBe(30)
      expect(result.shipping).toBe(15)
      expect(result.total).toBe(345)
    })

    it('should return zero for empty items', () => {
      const result = service.calculateTotals([])
      expect(result.subtotal).toBe(0)
      expect(result.total).toBe(0)
    })

    it('should not return negative total', () => {
      const items = [{ quantity: 1, price: 10 }]
      const result = service.calculateTotals(items, 100) // Discount > subtotal
      expect(result.total).toBe(0)
    })
  })

  describe('findById', () => {
    it('should return order with relations', async () => {
      const mockOrder = {
        id: 'order-1',
        orderNumber: 'ORD-123',
        status: 'pending',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder)

      const result = await service.findById('order-1')

      expect(result).toEqual(mockOrder)
      expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        include: {
          items: true,
          payments: true,
          fulfillments: true,
          events: { orderBy: { createdAt: 'desc' } },
        },
      })
    })

    it('should return null for non-existent order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null)

      const result = await service.findById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('findByOrderNumber', () => {
    it('should find order by order number', async () => {
      const mockOrder = { id: 'order-1', orderNumber: 'ORD-ABC123' }
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder)

      const result = await service.findByOrderNumber('ORD-ABC123')

      expect(result).toEqual(mockOrder)
      expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({
        where: { orderNumber: 'ORD-ABC123' },
        include: expect.any(Object),
      })
    })
  })

  describe('findMany', () => {
    it('should return paginated orders', async () => {
      const mockOrders = [
        { id: 'order-1', orderNumber: 'ORD-001' },
        { id: 'order-2', orderNumber: 'ORD-002' },
      ]
      mockPrisma.order.findMany.mockResolvedValue(mockOrders)
      mockPrisma.order.count.mockResolvedValue(10)

      const result = await service.findMany({ page: 1, limit: 10 })

      expect(result.data).toEqual(mockOrders)
      expect(result.total).toBe(10)
    })

    it('should filter by status', async () => {
      mockPrisma.order.findMany.mockResolvedValue([])
      mockPrisma.order.count.mockResolvedValue(0)

      await service.findMany({ status: 'pending' })

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending' }),
        })
      )
    })

    it('should filter by userId', async () => {
      mockPrisma.order.findMany.mockResolvedValue([])
      mockPrisma.order.count.mockResolvedValue(0)

      await service.findMany({ userId: 'user-123' })

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123' }),
        })
      )
    })

    it('should filter by date range', async () => {
      mockPrisma.order.findMany.mockResolvedValue([])
      mockPrisma.order.count.mockResolvedValue(0)

      const dateFrom = new Date('2024-01-01')
      const dateTo = new Date('2024-12-31')

      await service.findMany({ dateFrom, dateTo })

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
          }),
        })
      )
    })

    it('should search by order number or email', async () => {
      mockPrisma.order.findMany.mockResolvedValue([])
      mockPrisma.order.count.mockResolvedValue(0)

      await service.findMany({ search: 'test' })

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { orderNumber: { contains: 'test' } },
              { email: { contains: 'test' } },
            ],
          }),
        })
      )
    })
  })

  describe('create', () => {
    it('should create order with calculated totals', async () => {
      const mockCreatedOrder = {
        id: 'order-1',
        orderNumber: 'ORD-TEST123',
        total: 100,
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.create.mockResolvedValue(mockCreatedOrder)

      const input = {
        userId: 'user-1',
        email: 'test@example.com',
        items: [
          {
            variantId: 'variant-1',
            productName: 'Product 1',
            variantName: 'Default',
            sku: 'SKU-001',
            quantity: 2,
            price: 50,
          },
        ],
        shippingAddress: {
          street: '123 Main St',
          city: 'Test City',
          country: 'US',
        },
      }

      const result = await service.create(input)

      expect(result).toEqual(mockCreatedOrder)
      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            email: 'test@example.com',
            status: 'pending',
            paymentStatus: 'pending',
            fulfillmentStatus: 'unfulfilled',
            subtotal: 100,
            total: 100,
          }),
        })
      )
    })
  })

  describe('update', () => {
    it('should throw NotFoundError for non-existent order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null)

      await expect(service.update('non-existent', { status: 'confirmed' }))
        .rejects.toThrow(NotFoundError)
    })

    it('should update order status', async () => {
      const existingOrder = {
        id: 'order-1',
        status: 'pending',
        paymentStatus: 'pending',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(existingOrder)
      mockPrisma.order.update.mockResolvedValue({
        ...existingOrder,
        status: 'confirmed',
      })

      const result = await service.update('order-1', { status: 'confirmed' })

      expect(result.status).toBe('confirmed')
    })
  })

  describe('confirm', () => {
    it('should confirm pending order', async () => {
      const pendingOrder = {
        id: 'order-1',
        status: 'pending',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce(pendingOrder)
      mockPrisma.order.update.mockResolvedValue({
        ...pendingOrder,
        status: 'confirmed',
      })

      const result = await service.confirm('order-1')

      expect(result.status).toBe('confirmed')
    })

    it('should throw NotFoundError for non-existent order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null)

      await expect(service.confirm('non-existent'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw BadRequestError for non-pending order', async () => {
      const confirmedOrder = {
        id: 'order-1',
        status: 'confirmed',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(confirmedOrder)

      await expect(service.confirm('order-1'))
        .rejects.toThrow(BadRequestError)
    })
  })

  describe('cancel', () => {
    it('should cancel pending order', async () => {
      const pendingOrder = {
        id: 'order-1',
        status: 'pending',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(pendingOrder)
      mockPrisma.order.update.mockResolvedValue({
        ...pendingOrder,
        status: 'cancelled',
        cancelledAt: new Date(),
      })
      mockPrisma.orderEvent.create.mockResolvedValue({})

      const result = await service.cancel('order-1', 'Customer request')

      expect(result.status).toBe('cancelled')
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          status: 'cancelled',
        }),
        include: expect.any(Object),
      })
    })

    it('should throw NotFoundError for non-existent order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null)

      await expect(service.cancel('non-existent'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw BadRequestError for shipped order', async () => {
      const shippedOrder = {
        id: 'order-1',
        status: 'shipped',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(shippedOrder)

      await expect(service.cancel('order-1'))
        .rejects.toThrow(BadRequestError)
    })

    it('should throw BadRequestError when cancellation is disabled', async () => {
      const serviceWithConfig = new OrderService(mockPrisma as any, {
        features: { allowCancel: false },
      })
      const pendingOrder = {
        id: 'order-1',
        status: 'pending',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(pendingOrder)

      await expect(serviceWithConfig.cancel('order-1'))
        .rejects.toThrow(BadRequestError)
    })
  })

  describe('addEvent', () => {
    it('should add event to order', async () => {
      const order = {
        id: 'order-1',
        items: [],
        payments: [],
        fulfillments: [],
        events: [],
      }
      mockPrisma.order.findUnique.mockResolvedValue(order)
      mockPrisma.orderEvent.create.mockResolvedValue({
        id: 'event-1',
        orderId: 'order-1',
        type: 'note_added',
        data: null,
        note: 'Test note',
      })

      const result = await service.addEvent('order-1', {
        type: 'note_added',
        note: 'Test note',
      })

      expect(result.type).toBe('note_added')
      expect(result.note).toBe('Test note')
    })

    it('should throw NotFoundError for non-existent order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null)

      await expect(service.addEvent('non-existent', { type: 'test' }))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getEvents', () => {
    it('should return events ordered by createdAt desc', async () => {
      const mockEvents = [
        { id: 'event-2', type: 'status_changed', createdAt: new Date('2024-01-02') },
        { id: 'event-1', type: 'order_created', createdAt: new Date('2024-01-01') },
      ]
      mockPrisma.orderEvent.findMany.mockResolvedValue(mockEvents)

      const result = await service.getEvents('order-1')

      expect(result).toEqual(mockEvents)
      expect(mockPrisma.orderEvent.findMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        orderBy: { createdAt: 'desc' },
      })
    })
  })
})
