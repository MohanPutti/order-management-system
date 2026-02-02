// ============================================
// Stripe Payment Adapter
// Supports: Credit Cards, Debit Cards, Apple Pay, Google Pay
// ============================================

import { PaymentAdapter, CreatePaymentInput } from '../types.js'

// ============================================
// Types
// ============================================

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  /** API version (default: '2023-10-16') */
  apiVersion?: string
  /** Currency (default: 'usd') */
  defaultCurrency?: string
}

export interface StripePaymentIntent {
  id: string
  client_secret: string
  status: string
  amount: number
  currency: string
  payment_method?: string
  metadata?: Record<string, string>
}

export interface StripeWebhookEvent {
  id: string
  type: string
  data: {
    object: StripePaymentIntent
  }
}

// ============================================
// Stripe Adapter Implementation
// ============================================

export class StripeAdapter implements PaymentAdapter {
  name = 'stripe'
  private config: StripeConfig
  private baseUrl = 'https://api.stripe.com/v1'

  constructor(config: StripeConfig) {
    this.config = {
      apiVersion: '2023-10-16',
      defaultCurrency: 'usd',
      ...config,
    }
  }

  /**
   * Create a payment intent
   */
  async createPayment(input: CreatePaymentInput): Promise<{
    providerPaymentId: string
    clientSecret: string
    redirectUrl?: string
  }> {
    const response = await this.request<StripePaymentIntent>('/payment_intents', {
      method: 'POST',
      body: {
        amount: Math.round(input.amount * 100), // Stripe uses cents
        currency: input.currency.toLowerCase(),
        metadata: {
          orderId: input.orderId,
          ...((input.metadata as Record<string, string>) || {}),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      },
    })

    return {
      providerPaymentId: response.id,
      clientSecret: response.client_secret,
    }
  }

  /**
   * Create a payment intent with specific payment method
   */
  async createPaymentWithMethod(
    input: CreatePaymentInput,
    paymentMethodId: string
  ): Promise<{
    providerPaymentId: string
    status: string
    requiresAction: boolean
    clientSecret?: string
  }> {
    const response = await this.request<StripePaymentIntent>('/payment_intents', {
      method: 'POST',
      body: {
        amount: Math.round(input.amount * 100),
        currency: input.currency.toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        metadata: {
          orderId: input.orderId,
        },
      },
    })

    return {
      providerPaymentId: response.id,
      status: response.status,
      requiresAction: response.status === 'requires_action',
      clientSecret: response.client_secret,
    }
  }

  /**
   * Capture an authorized payment
   */
  async capturePayment(providerPaymentId: string): Promise<{ success: boolean; status: string }> {
    const response = await this.request<StripePaymentIntent>(`/payment_intents/${providerPaymentId}/capture`, {
      method: 'POST',
    })

    return {
      success: response.status === 'succeeded',
      status: response.status,
    }
  }

  /**
   * Refund a payment (full or partial)
   */
  async refundPayment(
    providerPaymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<{ success: boolean; refundId: string }> {
    const body: Record<string, unknown> = {
      payment_intent: providerPaymentId,
    }

    if (amount) {
      body.amount = Math.round(amount * 100)
    }

    // Use reason from notes if provided
    if (notes?.reason) {
      body.reason = notes.reason
    }

    const response = await this.request<{ id: string; status: string }>('/refunds', {
      method: 'POST',
      body,
    })

    return {
      success: response.status === 'succeeded',
      refundId: response.id,
    }
  }

  /**
   * Cancel a payment intent
   */
  async cancelPayment(providerPaymentId: string): Promise<{ success: boolean }> {
    const response = await this.request<StripePaymentIntent>(`/payment_intents/${providerPaymentId}/cancel`, {
      method: 'POST',
    })

    return {
      success: response.status === 'canceled',
    }
  }

  /**
   * Get payment intent details
   */
  async getPaymentStatus(providerPaymentId: string): Promise<{
    status: string
    amount: number
    currency: string
    paymentMethod?: string
  }> {
    const response = await this.request<StripePaymentIntent>(`/payment_intents/${providerPaymentId}`, {
      method: 'GET',
    })

    return {
      status: this.mapStatus(response.status),
      amount: response.amount / 100,
      currency: response.currency.toUpperCase(),
      paymentMethod: response.payment_method,
    }
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{
    event: string
    paymentId: string
    status: string
    metadata?: Record<string, unknown>
  }> {
    // Verify webhook signature
    const event = this.verifyWebhookSignature(payload, signature)

    const paymentIntent = event.data.object as StripePaymentIntent

    return {
      event: event.type,
      paymentId: paymentIntent.id,
      status: this.mapStatus(paymentIntent.status),
      metadata: paymentIntent.metadata,
    }
  }

  /**
   * Create a customer
   */
  async createCustomer(email: string, name?: string): Promise<{ customerId: string }> {
    const response = await this.request<{ id: string }>('/customers', {
      method: 'POST',
      body: { email, name },
    })

    return { customerId: response.id }
  }

  /**
   * Attach a payment method to customer
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<{ success: boolean }> {
    await this.request(`/payment_methods/${paymentMethodId}/attach`, {
      method: 'POST',
      body: { customer: customerId },
    })

    return { success: true }
  }

  /**
   * Create a setup intent for saving cards
   */
  async createSetupIntent(customerId: string): Promise<{
    setupIntentId: string
    clientSecret: string
  }> {
    const response = await this.request<{ id: string; client_secret: string }>('/setup_intents', {
      method: 'POST',
      body: {
        customer: customerId,
        automatic_payment_methods: { enabled: true },
      },
    })

    return {
      setupIntentId: response.id,
      clientSecret: response.client_secret,
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async request<T = Record<string, unknown>>(
    endpoint: string,
    options: { method: string; body?: Record<string, unknown> }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': this.config.apiVersion!,
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method,
      headers,
      body: options.body ? this.encodeBody(options.body) : undefined,
    })

    const data = (await response.json()) as T & { error?: { message: string } }

    if (!response.ok) {
      const errorData = data as { error?: { message: string } }
      throw new Error(`Stripe API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    return data
  }

  private encodeBody(body: Record<string, unknown>): string {
    const encode = (obj: Record<string, unknown>, prefix = ''): string[] => {
      const parts: string[] = []

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}[${key}]` : key

        if (value === null || value === undefined) {
          continue
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
          parts.push(...encode(value as Record<string, unknown>, fullKey))
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === 'object') {
              parts.push(...encode(item as Record<string, unknown>, `${fullKey}[${index}]`))
            } else {
              parts.push(`${fullKey}[${index}]=${encodeURIComponent(String(item))}`)
            }
          })
        } else {
          parts.push(`${fullKey}=${encodeURIComponent(String(value))}`)
        }
      }

      return parts
    }

    return encode(body).join('&')
  }

  private verifyWebhookSignature(payload: string | Buffer, signature: string): StripeWebhookEvent {
    // Simple signature verification
    // In production, use Stripe's official library for proper verification
    const crypto = require('crypto')
    const elements = signature.split(',')
    const signatureMap: Record<string, string> = {}

    for (const element of elements) {
      const [key, value] = element.split('=')
      signatureMap[key] = value
    }

    const timestamp = signatureMap['t']
    const expectedSignature = signatureMap['v1']

    if (!timestamp || !expectedSignature) {
      throw new Error('Invalid webhook signature format')
    }

    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8')
    const signedPayload = `${timestamp}.${payloadString}`

    const computedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(signedPayload)
      .digest('hex')

    if (computedSignature !== expectedSignature) {
      throw new Error('Webhook signature verification failed')
    }

    return JSON.parse(payloadString)
  }

  private mapStatus(stripeStatus: string): string {
    const statusMap: Record<string, string> = {
      requires_payment_method: 'pending',
      requires_confirmation: 'pending',
      requires_action: 'pending',
      processing: 'processing',
      requires_capture: 'authorized',
      canceled: 'cancelled',
      succeeded: 'completed',
    }

    return statusMap[stripeStatus] || 'unknown'
  }
}

// ============================================
// Factory Function
// ============================================

export function createStripeAdapter(config: StripeConfig): StripeAdapter {
  return new StripeAdapter(config)
}
