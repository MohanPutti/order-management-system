import { BaseModuleConfig, ModuleHooks, MonetaryValue, CrudHooks } from '../../shared/types/index.js'

// ============================================
// Order Module Types
// ============================================

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled'

export interface Order {
  id: string
  orderNumber: string
  userId: string | null
  email: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  subtotal: MonetaryValue
  discount: MonetaryValue
  tax: MonetaryValue
  shipping: MonetaryValue
  total: MonetaryValue
  currency: string
  shippingAddress: Address
  billingAddress: Address | null
  notes: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  cancelledAt: Date | null
}

export interface OrderWithRelations extends Order {
  items: OrderItem[]
  payments: Payment[]
  fulfillments: Fulfillment[]
  events: OrderEvent[]
}

export interface OrderItem {
  id: string
  orderId: string
  variantId: string | null
  productName: string
  variantName: string | null
  sku: string | null
  quantity: number
  price: MonetaryValue
  total: MonetaryValue
  fulfilledQty: number
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface OrderEvent {
  id: string
  orderId: string
  type: string
  data: Record<string, unknown> | null
  note: string | null
  createdBy: string | null
  createdAt: Date
}

export interface Address {
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  state?: string
  postalCode: string
  country: string
  phone?: string
}

export interface Payment {
  id: string
  orderId: string
  amount: MonetaryValue
  status: string
}

export interface Fulfillment {
  id: string
  orderId: string
  status: string
  trackingNumber: string | null
}

// ============================================
// Input Types
// ============================================

export interface CreateOrderInput {
  userId?: string
  email: string
  items: CreateOrderItemInput[]
  shippingAddress: Address
  billingAddress?: Address
  discountCode?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface CreateOrderItemInput {
  variantId?: string
  productName: string
  variantName?: string
  sku?: string
  quantity: number
  price: number
}

export interface UpdateOrderInput {
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  notes?: string
  metadata?: Record<string, unknown>
}

export interface AddOrderEventInput {
  type: string
  data?: Record<string, unknown>
  note?: string
  createdBy?: string
}

// ============================================
// Query Types
// ============================================

export interface OrderQueryParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  userId?: string
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  fulfillmentStatus?: FulfillmentStatus
  search?: string
  dateFrom?: Date
  dateTo?: Date
}

// ============================================
// Module Configuration
// ============================================

export interface OrderModuleConfig extends BaseModuleConfig {
  /** Order number generation */
  orderNumber?: {
    prefix?: string
    length?: number
  }

  /** Automatic status transitions */
  autoTransitions?: {
    /** Auto-confirm on payment */
    confirmOnPayment?: boolean
    /** Auto-complete on fulfillment */
    completeOnFulfillment?: boolean
  }

  /** Features */
  features?: {
    /** Allow order editing */
    allowEdit?: boolean
    /** Allow cancellation */
    allowCancel?: boolean
    /** Track events */
    trackEvents?: boolean
  }

  /** Module-specific hooks */
  hooks?: OrderModuleHooks
}

export interface OrderModuleHooks extends CrudHooks<Order, CreateOrderInput, UpdateOrderInput> {
  /** Called when order status changes */
  onStatusChange?: (orderId: string, oldStatus: OrderStatus, newStatus: OrderStatus) => void | Promise<void>
  /** Called when payment status changes */
  onPaymentStatusChange?: (orderId: string, oldStatus: PaymentStatus, newStatus: PaymentStatus) => void | Promise<void>
  /** Called when order is confirmed */
  onOrderConfirmed?: (order: Order) => void | Promise<void>
  /** Called when order is shipped */
  onOrderShipped?: (order: Order, trackingNumber?: string) => void | Promise<void>
  /** Called when order is delivered */
  onOrderDelivered?: (order: Order) => void | Promise<void>
  /** Called when order is cancelled */
  onOrderCancelled?: (order: Order, reason?: string) => void | Promise<void>
}

// ============================================
// Service Interface
// ============================================

export interface IOrderService {
  // Order CRUD
  findById(id: string): Promise<OrderWithRelations | null>
  findByOrderNumber(orderNumber: string): Promise<OrderWithRelations | null>
  findMany(params: OrderQueryParams): Promise<{ data: OrderWithRelations[]; total: number }>
  create(data: CreateOrderInput): Promise<OrderWithRelations>
  update(id: string, data: UpdateOrderInput): Promise<OrderWithRelations>

  // Status management
  confirm(id: string): Promise<OrderWithRelations>
  cancel(id: string, reason?: string): Promise<OrderWithRelations>

  // Events
  addEvent(orderId: string, event: AddOrderEventInput): Promise<OrderEvent>
  getEvents(orderId: string): Promise<OrderEvent[]>

  // Calculations
  calculateTotals(items: CreateOrderItemInput[], discount?: number, taxRate?: number, shippingCost?: number): OrderTotals
}

export interface OrderTotals {
  subtotal: number
  discount: number
  tax: number
  shipping: number
  total: number
}
