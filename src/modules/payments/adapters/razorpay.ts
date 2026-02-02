// ============================================
// Razorpay Payment Adapter
// Supports: UPI (GPay, PhonePe, Paytm), Cards, Netbanking, Wallets
// ============================================

import { PaymentAdapter, CreatePaymentInput } from '../types.js'

// ============================================
// Types
// ============================================

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  webhookSecret: string
  /** Default currency (default: 'INR') */
  defaultCurrency?: string
}

export interface RazorpayOrder {
  id: string
  entity: string
  amount: number
  amount_paid: number
  amount_due: number
  currency: string
  receipt: string
  status: string
  notes: Record<string, string>
  created_at: number
}

export interface RazorpayPayment {
  id: string
  entity: string
  amount: number
  currency: string
  status: string
  order_id: string
  method: string
  description?: string
  bank?: string
  wallet?: string
  vpa?: string // UPI VPA
  email: string
  contact: string
  notes: Record<string, string>
  created_at: number
  captured: boolean
}

export interface RazorpayRefund {
  id: string
  entity: string
  amount: number
  currency: string
  payment_id: string
  status: string
  created_at: number
}

export type RazorpayPaymentMethod =
  | 'card'
  | 'upi'
  | 'netbanking'
  | 'wallet'
  | 'emi'
  | 'bank_transfer'

// ============================================
// Razorpay Adapter Implementation
// ============================================

export class RazorpayAdapter implements PaymentAdapter {
  name = 'razorpay'
  private config: RazorpayConfig
  private baseUrl = 'https://api.razorpay.com/v1'

  constructor(config: RazorpayConfig) {
    this.config = {
      defaultCurrency: 'INR',
      ...config,
    }
  }

  /**
   * Create a Razorpay order
   */
  async createPayment(input: CreatePaymentInput): Promise<{
    providerPaymentId: string
    orderId: string
    amount: number
    currency: string
  }> {
    const order = await this.request<RazorpayOrder>('/orders', {
      method: 'POST',
      body: {
        amount: Math.round(input.amount * 100), // Razorpay uses paise
        currency: input.currency || this.config.defaultCurrency,
        receipt: input.orderId,
        notes: {
          orderId: input.orderId,
          ...((input.metadata as Record<string, string>) || {}),
        },
      },
    })

    return {
      providerPaymentId: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    }
  }

  /**
   * Create UPI payment link (for GPay, PhonePe, etc.)
   */
  async createUPIPayment(input: CreatePaymentInput & {
    customerEmail: string
    customerPhone: string
    upiFlow?: 'collect' | 'intent'
  }): Promise<{
    providerPaymentId: string
    shortUrl: string
    qrCode?: string
  }> {
    // First create an order
    const order = await this.createPayment(input)

    // Create payment link with UPI
    const paymentLink = await this.request<{
      id: string
      short_url: string
    }>('/payment_links', {
      method: 'POST',
      body: {
        amount: Math.round(input.amount * 100),
        currency: input.currency || this.config.defaultCurrency,
        accept_partial: false,
        reference_id: input.orderId,
        description: `Order ${input.orderId}`,
        customer: {
          email: input.customerEmail,
          contact: input.customerPhone,
        },
        notify: {
          sms: true,
          email: true,
        },
        options: {
          checkout: {
            method: {
              upi: {
                flow: input.upiFlow || 'intent',
              },
            },
          },
        },
        notes: {
          orderId: input.orderId,
        },
      },
    })

    return {
      providerPaymentId: order.providerPaymentId,
      shortUrl: paymentLink.short_url,
    }
  }

  /**
   * Create QR code for UPI payment
   */
  async createUPIQRCode(input: {
    amount: number
    orderId: string
    description?: string
    customerId?: string
  }): Promise<{
    qrCodeId: string
    imageUrl: string
  }> {
    const qrCode = await this.request<{
      id: string
      image_url: string
    }>('/payments/qr_codes', {
      method: 'POST',
      body: {
        type: 'upi_qr',
        name: `Order-${input.orderId}`,
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: Math.round(input.amount * 100),
        description: input.description || `Payment for order ${input.orderId}`,
        customer_id: input.customerId,
        notes: {
          orderId: input.orderId,
        },
      },
    })

    return {
      qrCodeId: qrCode.id,
      imageUrl: qrCode.image_url,
    }
  }

  /**
   * Verify payment signature (for client-side payments)
   */
  verifyPaymentSignature(params: {
    orderId: string
    paymentId: string
    signature: string
  }): boolean {
    const crypto = require('crypto')
    const expectedSignature = crypto
      .createHmac('sha256', this.config.keySecret)
      .update(`${params.orderId}|${params.paymentId}`)
      .digest('hex')

    return expectedSignature === params.signature
  }

  /**
   * Capture an authorized payment
   */
  async capturePayment(
    providerPaymentId: string,
    amount?: number,
    currency?: string
  ): Promise<{ success: boolean; status: string }> {
    const payment = await this.request<RazorpayPayment>(
      `/payments/${providerPaymentId}/capture`,
      {
        method: 'POST',
        body: {
          amount: amount ? Math.round(amount * 100) : undefined,
          currency: currency || this.config.defaultCurrency,
        },
      }
    )

    return {
      success: payment.status === 'captured',
      status: payment.status,
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    providerPaymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<{ success: boolean; refundId: string }> {
    const refund = await this.request<RazorpayRefund>(
      `/payments/${providerPaymentId}/refund`,
      {
        method: 'POST',
        body: {
          amount: amount ? Math.round(amount * 100) : undefined,
          notes,
        },
      }
    )

    return {
      success: refund.status === 'processed',
      refundId: refund.id,
    }
  }

  /**
   * Get payment details
   */
  async getPaymentStatus(providerPaymentId: string): Promise<{
    status: string
    amount: number
    currency: string
    method: string
    vpa?: string
    bank?: string
    wallet?: string
  }> {
    const payment = await this.request<RazorpayPayment>(
      `/payments/${providerPaymentId}`,
      { method: 'GET' }
    )

    return {
      status: this.mapStatus(payment.status),
      amount: payment.amount / 100,
      currency: payment.currency,
      method: payment.method,
      vpa: payment.vpa,
      bank: payment.bank,
      wallet: payment.wallet,
    }
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>(`/orders/${orderId}`, { method: 'GET' })
  }

  /**
   * Get payments for an order
   */
  async getOrderPayments(orderId: string): Promise<RazorpayPayment[]> {
    const result = await this.request<{ items: RazorpayPayment[] }>(
      `/orders/${orderId}/payments`,
      { method: 'GET' }
    )
    return result.items
  }

  /**
   * Handle Razorpay webhook
   */
  async handleWebhook(
    payload: string | Record<string, unknown>,
    signature: string
  ): Promise<{
    event: string
    paymentId: string
    status: string
    method?: string
    metadata?: Record<string, unknown>
  }> {
    // Verify webhook signature
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.verifyWebhookSignature(payloadString, signature)

    const body = typeof payload === 'string' ? JSON.parse(payload) : payload
    const event = body.event as string
    const paymentEntity = body.payload?.payment?.entity as RazorpayPayment

    return {
      event,
      paymentId: paymentEntity?.id || '',
      status: this.mapStatus(paymentEntity?.status || ''),
      method: paymentEntity?.method,
      metadata: paymentEntity?.notes,
    }
  }

  /**
   * Create virtual account for bank transfer
   */
  async createVirtualAccount(input: {
    customerId?: string
    customerEmail: string
    customerPhone: string
    orderId: string
    amount?: number
  }): Promise<{
    virtualAccountId: string
    bankAccount: {
      bankName: string
      accountNumber: string
      ifsc: string
      name: string
    }
  }> {
    const va = await this.request<{
      id: string
      receivers: Array<{
        bank_name: string
        account_number: string
        ifsc: string
        name: string
      }>
    }>('/virtual_accounts', {
      method: 'POST',
      body: {
        receivers: {
          types: ['bank_account'],
        },
        close_by: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
        notes: {
          orderId: input.orderId,
        },
        customer_id: input.customerId,
      },
    })

    const receiver = va.receivers[0]
    return {
      virtualAccountId: va.id,
      bankAccount: {
        bankName: receiver.bank_name,
        accountNumber: receiver.account_number,
        ifsc: receiver.ifsc,
        name: receiver.name,
      },
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async request<T>(
    endpoint: string,
    options: { method: string; body?: Record<string, unknown> }
  ): Promise<T> {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64')

    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Razorpay API error: ${data.error?.description || 'Unknown error'}`)
    }

    return data as T
  }

  private verifyWebhookSignature(payload: string, signature: string): void {
    const crypto = require('crypto')
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex')

    if (expectedSignature !== signature) {
      throw new Error('Webhook signature verification failed')
    }
  }

  private mapStatus(razorpayStatus: string): string {
    const statusMap: Record<string, string> = {
      created: 'pending',
      authorized: 'authorized',
      captured: 'completed',
      refunded: 'refunded',
      failed: 'failed',
    }

    return statusMap[razorpayStatus] || 'unknown'
  }
}

// ============================================
// Factory Function
// ============================================

export function createRazorpayAdapter(config: RazorpayConfig): RazorpayAdapter {
  return new RazorpayAdapter(config)
}
