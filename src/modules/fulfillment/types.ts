// ============================================
// Fulfillment Module Types
// ============================================

import { BaseModuleConfig } from '../../shared/types/index.js'

// ============================================
// Status Types
// ============================================

export type FulfillmentStatus = 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'failed' | 'returned'

// ============================================
// Entity Types
// ============================================

export interface Fulfillment {
  id: string
  orderId: string
  providerId: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  carrier: string | null
  status: FulfillmentStatus
  shippedAt: Date | null
  deliveredAt: Date | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface FulfillmentWithItems extends Fulfillment {
  items: FulfillmentItem[]
}

export interface FulfillmentItem {
  id: string
  fulfillmentId: string
  orderItemId: string
  quantity: number
}

export interface ShippingProvider {
  id: string
  name: string
  code: string
  isActive: boolean
  config: Record<string, unknown> | null
}

// ============================================
// Input Types
// ============================================

export interface CreateFulfillmentInput {
  orderId: string
  providerId?: string
  items: { orderItemId: string; quantity: number }[]
  metadata?: Record<string, unknown>
}

export interface ShipFulfillmentInput {
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
}

// ============================================
// Adapter Types
// ============================================

export interface ShippingAdapter {
  name: string
  createLabel(input: CreateLabelInput): Promise<{
    trackingNumber: string
    labelUrl: string
    transactionId?: string
  }>
  getRates(input: GetRatesInput): Promise<ShippingRate[]>
  trackShipment(trackingNumber: string, carrier?: string): Promise<TrackingInfo>
  cancelLabel(trackingNumber: string): Promise<boolean>
}

export interface CreateLabelInput {
  fromAddress: Address
  toAddress: Address
  packages: Package[]
  orderId?: string
  paymentMode?: 'Prepaid' | 'COD'
  codAmount?: number
  productDescription?: string
}

export interface GetRatesInput {
  fromAddress: Address
  toAddress: Address
  packages: Package[]
}

export interface Address {
  name: string
  phone?: string
  email?: string
  company?: string
  address1: string
  address2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export interface Package {
  weight: number // in kg
  length?: number // in cm
  width?: number // in cm
  height?: number // in cm
  value?: number
  description?: string
}

export interface ShippingRate {
  provider: string
  service: string
  rate: number
  currency: string
  estimatedDays: number
  rateId?: string
}

export interface TrackingInfo {
  status: string
  estimatedDelivery?: Date
  events: TrackingEvent[]
}

export interface TrackingEvent {
  timestamp: Date
  description: string
  location?: string
  status?: string
}

// ============================================
// Module Configuration
// ============================================

export interface FulfillmentModuleConfig extends BaseModuleConfig {
  /** Shipping adapters keyed by provider code */
  adapters?: {
    [providerCode: string]: ShippingAdapter
  }
  /** Default shipping provider code */
  defaultProvider?: string
  /** Lifecycle hooks */
  hooks?: {
    onFulfillmentCreated?: (fulfillment: Fulfillment) => void | Promise<void>
    onFulfillmentShipped?: (fulfillment: Fulfillment) => void | Promise<void>
    onFulfillmentDelivered?: (fulfillment: Fulfillment) => void | Promise<void>
    onFulfillmentFailed?: (fulfillment: Fulfillment, error: string) => void | Promise<void>
  }
}
