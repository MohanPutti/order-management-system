import { z } from 'zod'

// ============================================
// Order Validators
// ============================================

export const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
])

export const paymentStatusSchema = z.enum(['pending', 'paid', 'refunded', 'failed'])

export const fulfillmentStatusSchema = z.enum(['unfulfilled', 'partial', 'fulfilled'])

export const addressSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(255).optional(),
  address1: z.string().min(1).max(255),
  address2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(100),
  phone: z.string().max(20).optional(),
})

export const orderItemSchema = z.object({
  variantId: z.string().uuid().optional(),
  productName: z.string().min(1).max(255),
  variantName: z.string().max(255).optional(),
  sku: z.string().max(100).optional(),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
})

export const createOrderSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email(),
  items: z.array(orderItemSchema).min(1),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  discountCode: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateOrderSchema = z.object({
  status: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const addEventSchema = z.object({
  type: z.string().min(1).max(100),
  data: z.record(z.unknown()).optional(),
  note: z.string().max(1000).optional(),
  createdBy: z.string().max(255).optional(),
})

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
})

// ============================================
// Query Validators
// ============================================

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  userId: z.string().uuid().optional(),
  status: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  fulfillmentStatus: fulfillmentStatusSchema.optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
})

export const orderNumberParamSchema = z.object({
  orderNumber: z.string().min(1),
})

// ============================================
// Zod Inferred Types (for internal validation use)
// Note: Canonical types are in types.ts
// ============================================

export type OrderQueryInput = z.infer<typeof orderQuerySchema>
