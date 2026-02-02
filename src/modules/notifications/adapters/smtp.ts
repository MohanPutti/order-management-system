// ============================================
// SMTP Email Adapter
// Works with any SMTP server (Gmail, AWS SES, etc.)
// ============================================

import { createTransport, Transporter } from 'nodemailer'
import type { EmailAdapter } from '../types.js'

// ============================================
// Types
// ============================================

export interface SMTPConfig {
  host: string
  port: number
  secure?: boolean // true for 465, false for other ports
  auth: {
    user: string
    pass: string
  }
  /** Default from address */
  from: string
  /** Default from name */
  fromName?: string
  /** Reply-to address */
  replyTo?: string
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  attachments?: {
    filename: string
    content: string | Buffer
    contentType?: string
  }[]
}

// ============================================
// SMTP Adapter Implementation
// ============================================

export class SMTPAdapter implements EmailAdapter {
  name = 'smtp'
  private transporter: Transporter
  private config: SMTPConfig

  constructor(config: SMTPConfig) {
    this.config = config
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      auth: config.auth,
    })
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
  async sendEmail(options: SendEmailOptions): Promise<{
    messageId: string
    accepted: string[]
    rejected: string[]
  }> {
    const fromAddress = this.config.fromName
      ? `"${this.config.fromName}" <${this.config.from}>`
      : this.config.from

    const result = await this.transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo || this.config.replyTo,
      attachments: options.attachments,
    })

    return {
      messageId: result.messageId,
      accepted: result.accepted as string[],
      rejected: result.rejected as string[],
    }
  }

  /**
   * Send email using a template
   */
  async sendTemplatedEmail(
    to: string,
    subject: string,
    template: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const content = this.renderTemplate(template, data)
    await this.send(to, subject, content)
  }

  /**
   * Verify SMTP connection
   */
  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify()
      return true
    } catch {
      return false
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    this.transporter.close()
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    let result = template
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
      result = result.replace(regex, String(value))
    }
    return result
  }
}

// ============================================
// Factory Function
// ============================================

export function createSMTPAdapter(config: SMTPConfig): SMTPAdapter {
  return new SMTPAdapter(config)
}

// ============================================
// Common SMTP Configurations
// ============================================

export const gmailConfig = (user: string, pass: string, from?: string): SMTPConfig => ({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user, pass },
  from: from || user,
})

export const outlookConfig = (user: string, pass: string, from?: string): SMTPConfig => ({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: { user, pass },
  from: from || user,
})

export const sesConfig = (
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  from: string
): SMTPConfig => ({
  host: `email-smtp.${region}.amazonaws.com`,
  port: 587,
  secure: false,
  auth: {
    user: accessKeyId,
    pass: secretAccessKey,
  },
  from,
})
