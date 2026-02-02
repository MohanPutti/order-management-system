// ============================================
// Notification Adapters - Public API
// ============================================

// Email Adapters
export {
  SMTPAdapter,
  createSMTPAdapter,
  SMTPConfig,
  gmailConfig,
  outlookConfig,
  sesConfig,
} from './smtp.js'

export {
  SendGridAdapter,
  createSendGridAdapter,
  SendGridConfig,
} from './sendgrid.js'

// SMS Adapters
export {
  TwilioAdapter,
  createTwilioAdapter,
  TwilioConfig,
} from './twilio.js'

// Push Notification Adapters
export {
  FCMAdapter,
  createFCMAdapter,
  FCMConfig,
} from './fcm.js'

// ============================================
// Adapter Factory
// ============================================

import type { EmailAdapter, SmsAdapter, PushAdapter } from '../types.js'
import { SMTPAdapter, SMTPConfig } from './smtp.js'
import { SendGridAdapter, SendGridConfig } from './sendgrid.js'
import { TwilioAdapter, TwilioConfig } from './twilio.js'
import { FCMAdapter, FCMConfig } from './fcm.js'

export interface NotificationAdapterConfigs {
  smtp?: SMTPConfig
  sendgrid?: SendGridConfig
  twilio?: TwilioConfig
  fcm?: FCMConfig
}

export interface NotificationAdapters {
  email?: EmailAdapter
  sms?: SmsAdapter
  push?: PushAdapter
}

/**
 * Create notification adapters from configuration
 *
 * @example
 * ```typescript
 * const adapters = createNotificationAdapters({
 *   smtp: {
 *     host: 'smtp.gmail.com',
 *     port: 587,
 *     auth: { user: 'you@gmail.com', pass: 'app-password' },
 *     from: 'you@gmail.com',
 *   },
 *   twilio: {
 *     accountSid: process.env.TWILIO_ACCOUNT_SID!,
 *     authToken: process.env.TWILIO_AUTH_TOKEN!,
 *     from: '+1234567890',
 *   },
 *   fcm: {
 *     projectId: 'my-project',
 *     privateKey: process.env.FCM_PRIVATE_KEY!,
 *     clientEmail: 'firebase@my-project.iam.gserviceaccount.com',
 *   },
 * })
 * ```
 */
export function createNotificationAdapters(
  configs: NotificationAdapterConfigs
): NotificationAdapters {
  const adapters: NotificationAdapters = {}

  // Email: Prefer SendGrid if both configured
  if (configs.sendgrid) {
    adapters.email = new SendGridAdapter(configs.sendgrid)
  } else if (configs.smtp) {
    adapters.email = new SMTPAdapter(configs.smtp)
  }

  // SMS
  if (configs.twilio) {
    adapters.sms = new TwilioAdapter(configs.twilio)
  }

  // Push
  if (configs.fcm) {
    adapters.push = new FCMAdapter(configs.fcm)
  }

  return adapters
}
