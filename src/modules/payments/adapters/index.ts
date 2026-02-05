// ============================================
// Payment Adapters - Public API
// ============================================

// Stripe Adapter
export {
  StripeAdapter,
  createStripeAdapter,
  StripeConfig,
  StripePaymentIntent,
  StripeWebhookEvent,
} from './stripe.js'

// Razorpay Adapter (supports UPI: GPay, PhonePe, Paytm)
export {
  RazorpayAdapter,
  createRazorpayAdapter,
  RazorpayConfig,
  RazorpayOrder,
  RazorpayPayment,
  RazorpayRefund,
  RazorpayPaymentMethod,
} from './razorpay.js'

// PhonePe Adapter (direct PhonePe gateway)
export {
  PhonePeAdapter,
  createPhonePeAdapter,
  PhonePeConfig,
  PhonePePaymentRequest,
  PhonePePaymentResponse,
  PhonePeStatusResponse,
} from './phonepe.js'

// ============================================
// Adapter Factory
// ============================================

import { PaymentAdapter } from '../types.js'
import { StripeAdapter, StripeConfig } from './stripe.js'
import { RazorpayAdapter, RazorpayConfig } from './razorpay.js'
import { PhonePeAdapter, PhonePeConfig } from './phonepe.js'

export type AdapterType = 'stripe' | 'razorpay' | 'phonepe'

export interface AdapterConfigs {
  stripe?: StripeConfig
  razorpay?: RazorpayConfig
  phonepe?: PhonePeConfig
}

/**
 * Create payment adapters from configuration
 *
 * @example
 * ```typescript
 * const adapters = createPaymentAdapters({
 *   stripe: {
 *     secretKey: process.env.STRIPE_SECRET_KEY!,
 *     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   },
 *   razorpay: {
 *     keyId: process.env.RAZORPAY_KEY_ID!,
 *     keySecret: process.env.RAZORPAY_KEY_SECRET!,
 *     webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
 *   },
 * })
 * ```
 */
export function createPaymentAdapters(configs: AdapterConfigs): Record<string, PaymentAdapter> {
  const adapters: Record<string, PaymentAdapter> = {}

  if (configs.stripe) {
    adapters.stripe = new StripeAdapter(configs.stripe)
  }

  if (configs.razorpay) {
    adapters.razorpay = new RazorpayAdapter(configs.razorpay)
  }

  if (configs.phonepe) {
    adapters.phonepe = new PhonePeAdapter(configs.phonepe)
  }

  return adapters
}

/**
 * Get a specific adapter by name
 */
export function getAdapter(
  adapters: Record<string, PaymentAdapter>,
  name: AdapterType
): PaymentAdapter | undefined {
  return adapters[name]
}
