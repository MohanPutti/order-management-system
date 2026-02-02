// ============================================
// Payment Module Types
// ============================================

import { BaseModuleConfig, MonetaryValue } from '../../shared/types/index.js'

// ============================================
// Database Entity Types
// ============================================

export type PaymentStatus = 'pending' | 'processing' | 'authorized' | 'completed' | 'failed' | 'refunded' | 'cancelled'

export interface Payment {
  id: string
  orderId: string
  providerId: string
  providerPaymentId: string | null
  amount: MonetaryValue
  currency: string
  status: PaymentStatus
  method: string | null
  metadata: Record<string, unknown> | null
  paidAt: Date | null
  failedAt: Date | null
  refundedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PaymentProvider {
  id: string
  name: string
  code: string
  isActive: boolean
  config: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface Refund {
  id: string
  paymentId: string
  providerRefundId: string | null
  amount: MonetaryValue
  reason: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

// ============================================
// Input Types
// ============================================

export interface CreatePaymentInput {
  orderId: string
  amount: number
  currency: string
  method?: string
  metadata?: Record<string, unknown>
  /** Customer email (required for some adapters) */
  customerEmail?: string
  /** Customer phone (required for some adapters like Razorpay UPI) */
  customerPhone?: string
}

/** Extended input for creating payments via the service (includes provider selection) */
export interface CreatePaymentServiceInput extends CreatePaymentInput {
  providerId: string
}

export interface CapturePaymentInput {
  amount?: number
  currency?: string
}

export interface RefundPaymentInput {
  amount?: number
  reason?: string
}

// ============================================
// Adapter Interface
// ============================================

/**
 * Base payment adapter interface
 * Adapters must implement at minimum these methods
 */
export interface PaymentAdapter {
  /** Adapter name (e.g., 'stripe', 'razorpay') */
  name: string

  /**
   * Create a payment/order with the provider
   */
  createPayment(input: CreatePaymentInput): Promise<{
    providerPaymentId: string
    clientSecret?: string
    redirectUrl?: string
    orderId?: string
    amount?: number
    currency?: string
  }>

  /**
   * Capture an authorized payment
   */
  capturePayment(
    providerPaymentId: string,
    amount?: number,
    currency?: string
  ): Promise<{
    success: boolean
    status: string
  }>

  /**
   * Refund a payment (full or partial)
   */
  refundPayment(
    providerPaymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<{
    success: boolean
    refundId: string
  }>

  /**
   * Get payment status from provider
   */
  getPaymentStatus(providerPaymentId: string): Promise<{
    status: string
    amount: number
    currency: string
    method?: string
    [key: string]: unknown
  }>

  /**
   * Handle webhook from provider
   */
  handleWebhook(
    payload: string | Record<string, unknown> | Buffer,
    signature: string
  ): Promise<{
    event: string
    paymentId: string
    status: string
    method?: string
    metadata?: Record<string, unknown>
  }>
}

/**
 * Extended adapter interface for UPI payments (GPay, PhonePe, Paytm)
 */
export interface UPIPaymentAdapter extends PaymentAdapter {
  /**
   * Create UPI payment link
   */
  createUPIPayment(input: CreatePaymentInput & {
    customerEmail: string
    customerPhone: string
    upiFlow?: 'collect' | 'intent'
  }): Promise<{
    providerPaymentId: string
    shortUrl: string
    qrCode?: string
  }>

  /**
   * Create QR code for UPI payment
   */
  createUPIQRCode(input: {
    amount: number
    orderId: string
    description?: string
    customerId?: string
  }): Promise<{
    qrCodeId: string
    imageUrl: string
  }>
}

/**
 * Extended adapter interface for card payments with saved cards
 */
export interface CardPaymentAdapter extends PaymentAdapter {
  /**
   * Create a customer in the provider
   */
  createCustomer(email: string, name?: string): Promise<{
    customerId: string
  }>

  /**
   * Attach a payment method to customer
   */
  attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<{
    success: boolean
  }>

  /**
   * Create a setup intent for saving cards
   */
  createSetupIntent(customerId: string): Promise<{
    setupIntentId: string
    clientSecret: string
  }>
}

// ============================================
// Module Configuration
// ============================================

export interface PaymentModuleConfig extends BaseModuleConfig {
  /** Default currency for payments */
  defaultCurrency?: string

  /** Payment adapters keyed by provider code */
  adapters?: {
    [providerCode: string]: PaymentAdapter
  }

  /** Lifecycle hooks */
  hooks?: {
    /** Called after payment is created */
    onPaymentCreated?: (payment: Payment) => void | Promise<void>
    /** Called after payment is completed/captured */
    onPaymentCompleted?: (payment: Payment) => void | Promise<void>
    /** Called when payment fails */
    onPaymentFailed?: (payment: Payment, error: string) => void | Promise<void>
    /** Called after refund is processed */
    onRefundCompleted?: (payment: Payment, refund: Refund) => void | Promise<void>
  }
}

// ============================================
// Webhook Types
// ============================================

export interface WebhookPayload {
  event: string
  paymentId: string
  status: string
  method?: string
  metadata?: Record<string, unknown>
  raw?: unknown
}

// ============================================
// Response Types
// ============================================

export interface PaymentResponse {
  payment: Payment
  clientSecret?: string
  redirectUrl?: string
}

export interface RefundResponse {
  refund: Refund
  payment: Payment
}
