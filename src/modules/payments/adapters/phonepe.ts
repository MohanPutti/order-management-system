// ============================================
// PhonePe Payment Adapter
// Supports: UPI, Cards, Netbanking, Wallets
// ============================================

import crypto from 'crypto'
import { PaymentAdapter, CreatePaymentInput } from '../types.js'

// ============================================
// Types
// ============================================

export interface PhonePeConfig {
  merchantId: string
  saltKey: string
  saltIndex: string
  /** Environment: 'production' | 'uat' (default: 'uat') */
  environment?: 'production' | 'uat'
  /** Callback URL for payment status */
  callbackUrl?: string
  /** Redirect URL after payment */
  redirectUrl?: string
}

export interface PhonePePaymentRequest {
  merchantId: string
  merchantTransactionId: string
  merchantUserId: string
  amount: number
  redirectUrl: string
  redirectMode: string
  callbackUrl: string
  mobileNumber?: string
  paymentInstrument: {
    type: string
    targetApp?: string
  }
}

export interface PhonePePaymentResponse {
  success: boolean
  code: string
  message: string
  data: {
    merchantId: string
    merchantTransactionId: string
    instrumentResponse?: {
      type: string
      redirectInfo?: {
        url: string
        method: string
      }
    }
  }
}

export interface PhonePeStatusResponse {
  success: boolean
  code: string
  message: string
  data: {
    merchantId: string
    merchantTransactionId: string
    transactionId: string
    amount: number
    state: 'COMPLETED' | 'FAILED' | 'PENDING'
    responseCode: string
    paymentInstrument: {
      type: string
      utr?: string
    }
  }
}

// ============================================
// PhonePe Adapter Implementation
// ============================================

export class PhonePeAdapter implements PaymentAdapter {
  name = 'phonepe'
  private config: Required<PhonePeConfig>
  private baseUrl: string

  constructor(config: PhonePeConfig) {
    this.config = {
      environment: 'uat',
      callbackUrl: '',
      redirectUrl: '',
      ...config,
    }

    // PhonePe API endpoints
    this.baseUrl = this.config.environment === 'production'
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/hermes'
  }

  /**
   * Generate X-VERIFY header for PhonePe API authentication
   */
  private generateChecksum(payload: string): string {
    const stringToHash = payload + '/pg/v1/pay' + this.config.saltKey
    const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex')
    return `${sha256Hash}###${this.config.saltIndex}`
  }

  /**
   * Generate X-VERIFY header for status check
   */
  private generateStatusChecksum(merchantTransactionId: string): string {
    const stringToHash = `/pg/v1/status/${this.config.merchantId}/${merchantTransactionId}` + this.config.saltKey
    const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex')
    return `${sha256Hash}###${this.config.saltIndex}`
  }

  /**
   * Create a payment with PhonePe
   */
  async createPayment(input: CreatePaymentInput): Promise<{
    providerPaymentId: string
    clientSecret?: string
    redirectUrl?: string
    orderId?: string
    amount?: number
    currency?: string
  }> {
    try {
      const merchantTransactionId = `TXN${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`
      const merchantUserId = input.metadata?.userId as string || `USER${Date.now()}`

      // Convert amount to paise (PhonePe uses smallest currency unit)
      const amountInPaise = Math.round(input.amount * 100)

      const paymentRequest: PhonePePaymentRequest = {
        merchantId: this.config.merchantId,
        merchantTransactionId,
        merchantUserId,
        amount: amountInPaise,
        redirectUrl: this.config.redirectUrl || input.metadata?.redirectUrl as string || '',
        redirectMode: 'POST',
        callbackUrl: this.config.callbackUrl || input.metadata?.callbackUrl as string || '',
        mobileNumber: input.customerPhone,
        paymentInstrument: {
          type: 'PAY_PAGE', // Shows all payment options (UPI, Cards, etc.)
        },
      }

      // Base64 encode the payment request
      const payloadBase64 = Buffer.from(JSON.stringify(paymentRequest)).toString('base64')

      // Generate checksum
      const xVerify = this.generateChecksum(payloadBase64)

      // Make API call
      const response = await fetch(`${this.baseUrl}/pg/v1/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({
          request: payloadBase64,
        }),
      })

      const result: PhonePePaymentResponse = await response.json()

      if (!result.success) {
        throw new Error(`PhonePe payment creation failed: ${result.message}`)
      }

      // Get redirect URL from response
      const redirectUrl = result.data.instrumentResponse?.redirectInfo?.url || ''

      return {
        providerPaymentId: merchantTransactionId,
        orderId: merchantTransactionId,
        redirectUrl,
        amount: input.amount,
        currency: input.currency,
      }
    } catch (error) {
      throw new Error(`PhonePe createPayment failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Capture payment (PhonePe auto-captures, so this checks status)
   */
  async capturePayment(
    providerPaymentId: string,
    amount?: number,
    currency?: string
  ): Promise<{
    success: boolean
    status: string
  }> {
    try {
      const statusResponse = await this.getPaymentStatus(providerPaymentId)

      return {
        success: statusResponse.status === 'COMPLETED',
        status: statusResponse.status,
      }
    } catch (error) {
      throw new Error(`PhonePe capturePayment failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    providerPaymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<{
    success: boolean
    refundId: string
  }> {
    try {
      const refundTransactionId = `REFUND${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`

      const refundRequest = {
        merchantId: this.config.merchantId,
        merchantTransactionId: refundTransactionId,
        originalTransactionId: providerPaymentId,
        amount: amount ? Math.round(amount * 100) : undefined, // Convert to paise
        callbackUrl: this.config.callbackUrl,
      }

      const payloadBase64 = Buffer.from(JSON.stringify(refundRequest)).toString('base64')
      const xVerify = this.generateChecksum(payloadBase64)

      const response = await fetch(`${this.baseUrl}/pg/v1/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({
          request: payloadBase64,
        }),
      })

      const result = await response.json()

      return {
        success: result.success || false,
        refundId: refundTransactionId,
      }
    } catch (error) {
      throw new Error(`PhonePe refundPayment failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(providerPaymentId: string): Promise<{
    status: string
    amount: number
    currency: string
    method?: string
    [key: string]: unknown
  }> {
    try {
      const xVerify = this.generateStatusChecksum(providerPaymentId)

      const response = await fetch(
        `${this.baseUrl}/pg/v1/status/${this.config.merchantId}/${providerPaymentId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': xVerify,
          },
        }
      )

      const result: PhonePeStatusResponse = await response.json()

      if (!result.success) {
        throw new Error(`PhonePe status check failed: ${result.message}`)
      }

      return {
        status: result.data.state,
        amount: result.data.amount / 100, // Convert from paise to rupees
        currency: 'INR',
        method: result.data.paymentInstrument.type,
        transactionId: result.data.transactionId,
        utr: result.data.paymentInstrument.utr,
      }
    } catch (error) {
      throw new Error(`PhonePe getPaymentStatus failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle PhonePe webhook
   */
  async handleWebhook(
    payload: string | Record<string, unknown> | Buffer,
    signature: string
  ): Promise<{
    event: string
    paymentId: string
    status: string
    method?: string
    metadata?: Record<string, unknown>
  }> {
    try {
      let data: Record<string, unknown>

      if (typeof payload === 'string') {
        data = JSON.parse(payload)
      } else if (Buffer.isBuffer(payload)) {
        data = JSON.parse(payload.toString())
      } else {
        data = payload
      }

      // Verify signature
      const response = data.response as string
      const decodedResponse = JSON.parse(Buffer.from(response, 'base64').toString())

      // Verify checksum
      const expectedChecksum = signature.split('###')[0]
      const stringToHash = response + this.config.saltKey
      const calculatedChecksum = crypto.createHash('sha256').update(stringToHash).digest('hex')

      if (expectedChecksum !== calculatedChecksum) {
        throw new Error('Invalid webhook signature')
      }

      return {
        event: decodedResponse.data.state === 'COMPLETED' ? 'payment.success' : 'payment.failed',
        paymentId: decodedResponse.data.merchantTransactionId,
        status: decodedResponse.data.state,
        method: decodedResponse.data.paymentInstrument?.type,
        metadata: decodedResponse.data,
      }
    } catch (error) {
      throw new Error(`PhonePe handleWebhook failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * Factory function to create PhonePe adapter
 */
export function createPhonePeAdapter(config: PhonePeConfig): PhonePeAdapter {
  return new PhonePeAdapter(config)
}
