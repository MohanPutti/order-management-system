// ============================================
// SendGrid Email Adapter
// ============================================

import type { EmailAdapter } from '../types.js'

// ============================================
// Types
// ============================================

export interface SendGridConfig {
  apiKey: string
  /** Default from email */
  from: string
  /** Default from name */
  fromName?: string
  /** Reply-to email */
  replyTo?: string
}

export interface SendGridEmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  templateId?: string
  dynamicTemplateData?: Record<string, unknown>
  categories?: string[]
  attachments?: {
    content: string // Base64 encoded
    filename: string
    type?: string
    disposition?: 'attachment' | 'inline'
  }[]
}

interface SendGridPersonalization {
  to: { email: string }[]
  cc?: { email: string }[]
  bcc?: { email: string }[]
  dynamic_template_data?: Record<string, unknown>
}

interface SendGridMailRequest {
  personalizations: SendGridPersonalization[]
  from: { email: string; name?: string }
  reply_to?: { email: string }
  subject?: string
  content?: { type: string; value: string }[]
  template_id?: string
  categories?: string[]
  attachments?: {
    content: string
    filename: string
    type?: string
    disposition?: string
  }[]
}

// ============================================
// SendGrid Adapter Implementation
// ============================================

export class SendGridAdapter implements EmailAdapter {
  name = 'sendgrid'
  private config: SendGridConfig
  private baseUrl = 'https://api.sendgrid.com/v3'

  constructor(config: SendGridConfig) {
    this.config = config
  }

  /**
   * Send a simple email
   */
  async send(to: string, subject: string, content: string): Promise<void> {
    await this.sendEmail({
      to,
      subject,
      html: content,
    })
  }

  /**
   * Send email with full options
   */
  async sendEmail(options: SendGridEmailOptions): Promise<{
    messageId: string
  }> {
    const toArray = Array.isArray(options.to) ? options.to : [options.to]

    const personalization: SendGridPersonalization = {
      to: toArray.map((email) => ({ email })),
    }

    if (options.cc) {
      const ccArray = Array.isArray(options.cc) ? options.cc : [options.cc]
      personalization.cc = ccArray.map((email) => ({ email }))
    }

    if (options.bcc) {
      const bccArray = Array.isArray(options.bcc) ? options.bcc : [options.bcc]
      personalization.bcc = bccArray.map((email) => ({ email }))
    }

    if (options.dynamicTemplateData) {
      personalization.dynamic_template_data = options.dynamicTemplateData
    }

    const body: SendGridMailRequest = {
      personalizations: [personalization],
      from: {
        email: this.config.from,
        name: this.config.fromName,
      },
    }

    if (options.replyTo || this.config.replyTo) {
      body.reply_to = { email: options.replyTo || this.config.replyTo! }
    }

    if (options.templateId) {
      body.template_id = options.templateId
    } else {
      body.subject = options.subject
      body.content = []
      if (options.text) {
        body.content.push({ type: 'text/plain', value: options.text })
      }
      if (options.html) {
        body.content.push({ type: 'text/html', value: options.html })
      }
    }

    if (options.categories) {
      body.categories = options.categories
    }

    if (options.attachments) {
      body.attachments = options.attachments
    }

    const response = await this.request('/mail/send', {
      method: 'POST',
      body,
    })

    return {
      messageId: response.headers?.get('x-message-id') || '',
    }
  }

  /**
   * Send email using a SendGrid template
   */
  async sendTemplatedEmail(
    to: string,
    templateId: string,
    dynamicData: Record<string, unknown>
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: '', // Subject comes from template
      templateId,
      dynamicTemplateData: dynamicData,
    })
  }

  /**
   * Add contacts to a list
   */
  async addContacts(
    contacts: { email: string; firstName?: string; lastName?: string }[],
    listIds?: string[]
  ): Promise<{ jobId: string }> {
    const response = await this.request<{ job_id: string }>('/marketing/contacts', {
      method: 'PUT',
      body: {
        list_ids: listIds,
        contacts: contacts.map((c) => ({
          email: c.email,
          first_name: c.firstName,
          last_name: c.lastName,
        })),
      },
    })

    return { jobId: response.job_id }
  }

  /**
   * Get email activity
   */
  async getActivity(
    query?: string,
    limit?: number
  ): Promise<{
    messages: {
      from_email: string
      to_email: string
      subject: string
      status: string
      last_event_time: string
    }[]
  }> {
    const params = new URLSearchParams()
    if (query) params.append('query', query)
    if (limit) params.append('limit', String(limit))

    return this.request(`/messages?${params.toString()}`, {
      method: 'GET',
    })
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async request<T = { headers?: Headers }>(
    endpoint: string,
    options: { method: string; body?: unknown }
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    // SendGrid returns 202 for successful sends with no body
    if (response.status === 202) {
      return { headers: response.headers } as T
    }

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`SendGrid API error: ${JSON.stringify(error)}`)
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }
}

// ============================================
// Factory Function
// ============================================

export function createSendGridAdapter(config: SendGridConfig): SendGridAdapter {
  return new SendGridAdapter(config)
}
