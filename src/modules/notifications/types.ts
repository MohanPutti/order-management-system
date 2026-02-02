// ============================================
// Notification Module Types
// ============================================

import { BaseModuleConfig } from '../../shared/types/index.js'

// ============================================
// Status Types
// ============================================

export type NotificationType = 'email' | 'sms' | 'push'
export type NotificationStatus = 'pending' | 'sent' | 'failed'

// ============================================
// Entity Types
// ============================================

export interface Notification {
  id: string
  type: NotificationType
  recipient: string
  subject: string | null
  content: string
  status: NotificationStatus
  sentAt: Date | null
  failedAt: Date | null
  error: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface NotificationTemplate {
  id: string
  name: string
  type: NotificationType
  subject: string | null
  content: string
  variables: string[] | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// ============================================
// Input Types
// ============================================

export interface SendNotificationInput {
  type: NotificationType
  recipient: string
  subject?: string
  content?: string
  templateName?: string
  templateData?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface CreateTemplateInput {
  name: string
  type: NotificationType
  subject?: string
  content: string
  variables?: string[]
}

export interface UpdateTemplateInput {
  name?: string
  type?: NotificationType
  subject?: string
  content?: string
  variables?: string[]
  isActive?: boolean
}

// ============================================
// Adapter Interfaces
// ============================================

export interface EmailAdapter {
  name: string
  send(to: string, subject: string, content: string): Promise<void>
}

export interface SmsAdapter {
  name: string
  send(to: string, content: string): Promise<void>
}

export interface PushAdapter {
  name: string
  send(to: string, title: string, body: string): Promise<void>
}

// ============================================
// Module Configuration
// ============================================

export interface NotificationModuleConfig extends BaseModuleConfig {
  /** Email adapter */
  adapters?: {
    email?: EmailAdapter
    sms?: SmsAdapter
    push?: PushAdapter
  }
  /** Default sender info */
  defaults?: {
    emailFrom?: string
    emailFromName?: string
    smsFrom?: string
  }
  /** Lifecycle hooks */
  hooks?: {
    onNotificationSent?: (notification: Notification) => void | Promise<void>
    onNotificationFailed?: (notification: Notification, error: string) => void | Promise<void>
  }
}
