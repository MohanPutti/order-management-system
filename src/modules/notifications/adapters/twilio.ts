// ============================================
// Twilio SMS Adapter
// ============================================

import type { SmsAdapter } from '../types.js'

// ============================================
// Types
// ============================================

export interface TwilioConfig {
  accountSid: string
  authToken: string
  /** Default from phone number (E.164 format) */
  from: string
  /** Messaging service SID (optional, alternative to from) */
  messagingServiceSid?: string
}

export interface TwilioSendOptions {
  to: string
  body: string
  from?: string
  mediaUrl?: string[]
  statusCallback?: string
}

interface TwilioMessageResponse {
  sid: string
  date_created: string
  date_updated: string
  date_sent: string | null
  account_sid: string
  to: string
  from: string
  messaging_service_sid: string | null
  body: string
  status: string
  num_segments: string
  num_media: string
  direction: string
  api_version: string
  price: string | null
  price_unit: string
  error_code: string | null
  error_message: string | null
  uri: string
}

// ============================================
// Twilio Adapter Implementation
// ============================================

export class TwilioAdapter implements SmsAdapter {
  name = 'twilio'
  private config: TwilioConfig
  private baseUrl: string

  constructor(config: TwilioConfig) {
    this.config = config
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`
  }

  /**
   * Send a simple SMS
   */
  async send(to: string, content: string): Promise<void> {
    await this.sendSMS({ to, body: content })
  }

  /**
   * Send SMS with full options
   */
  async sendSMS(options: TwilioSendOptions): Promise<{
    messageId: string
    status: string
    segments: number
  }> {
    const formData = new URLSearchParams()
    formData.append('To', this.formatPhoneNumber(options.to))
    formData.append('Body', options.body)

    if (this.config.messagingServiceSid) {
      formData.append('MessagingServiceSid', this.config.messagingServiceSid)
    } else {
      formData.append('From', options.from || this.config.from)
    }

    if (options.mediaUrl) {
      options.mediaUrl.forEach((url) => formData.append('MediaUrl', url))
    }

    if (options.statusCallback) {
      formData.append('StatusCallback', options.statusCallback)
    }

    const response = await this.request<TwilioMessageResponse>('/Messages.json', {
      method: 'POST',
      body: formData.toString(),
    })

    return {
      messageId: response.sid,
      status: response.status,
      segments: parseInt(response.num_segments, 10),
    }
  }

  /**
   * Send MMS with media
   */
  async sendMMS(
    to: string,
    body: string,
    mediaUrls: string[]
  ): Promise<{ messageId: string }> {
    const result = await this.sendSMS({
      to,
      body,
      mediaUrl: mediaUrls,
    })
    return { messageId: result.messageId }
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageId: string): Promise<{
    status: string
    errorCode: string | null
    errorMessage: string | null
    dateSent: string | null
  }> {
    const response = await this.request<TwilioMessageResponse>(
      `/Messages/${messageId}.json`,
      { method: 'GET' }
    )

    return {
      status: response.status,
      errorCode: response.error_code,
      errorMessage: response.error_message,
      dateSent: response.date_sent,
    }
  }

  /**
   * List recent messages
   */
  async listMessages(options?: {
    to?: string
    from?: string
    dateSentAfter?: Date
    limit?: number
  }): Promise<{
    messages: {
      sid: string
      to: string
      from: string
      body: string
      status: string
      dateSent: string
    }[]
  }> {
    const params = new URLSearchParams()
    if (options?.to) params.append('To', options.to)
    if (options?.from) params.append('From', options.from)
    if (options?.dateSentAfter) {
      params.append('DateSent>', options.dateSentAfter.toISOString())
    }
    if (options?.limit) params.append('PageSize', String(options.limit))

    const response = await this.request<{ messages: TwilioMessageResponse[] }>(
      `/Messages.json?${params.toString()}`,
      { method: 'GET' }
    )

    return {
      messages: response.messages.map((msg) => ({
        sid: msg.sid,
        to: msg.to,
        from: msg.from,
        body: msg.body,
        status: msg.status,
        dateSent: msg.date_sent || msg.date_created,
      })),
    }
  }

  /**
   * Lookup phone number info
   */
  async lookupPhoneNumber(phoneNumber: string): Promise<{
    phoneNumber: string
    countryCode: string
    carrier?: { name: string; type: string }
    valid: boolean
  }> {
    const lookupUrl = `https://lookups.twilio.com/v1/PhoneNumbers/${encodeURIComponent(phoneNumber)}`

    const response = await fetch(`${lookupUrl}?Type=carrier`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          phoneNumber,
          countryCode: '',
          valid: false,
        }
      }
      throw new Error(`Twilio Lookup error: ${response.statusText}`)
    }

    const data = await response.json() as {
      phone_number: string
      country_code: string
      carrier?: { name: string; type: string }
    }

    return {
      phoneNumber: data.phone_number,
      countryCode: data.country_code,
      carrier: data.carrier,
      valid: true,
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters except leading +
    let formatted = phone.replace(/[^\d+]/g, '')

    // Add + if not present and looks like a full number
    if (!formatted.startsWith('+') && formatted.length >= 10) {
      // Assume US/Canada if 10 digits
      if (formatted.length === 10) {
        formatted = `+1${formatted}`
      } else {
        formatted = `+${formatted}`
      }
    }

    return formatted
  }

  private async request<T>(
    endpoint: string,
    options: { method: string; body?: string }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
    }

    if (options.body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method,
      headers,
      body: options.body,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Twilio API error: ${data.message || JSON.stringify(data)}`)
    }

    return data as T
  }
}

// ============================================
// Factory Function
// ============================================

export function createTwilioAdapter(config: TwilioConfig): TwilioAdapter {
  return new TwilioAdapter(config)
}
