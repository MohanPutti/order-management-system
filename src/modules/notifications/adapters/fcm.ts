// ============================================
// Firebase Cloud Messaging (FCM) Push Adapter
// ============================================

import type { PushAdapter } from '../types.js'

// ============================================
// Types
// ============================================

export interface FCMConfig {
  /** Firebase project ID */
  projectId: string
  /** Service account private key */
  privateKey: string
  /** Service account client email */
  clientEmail: string
}

export interface FCMSendOptions {
  /** Device token or topic */
  to: string
  /** Notification title */
  title: string
  /** Notification body */
  body: string
  /** Image URL */
  imageUrl?: string
  /** Click action URL */
  clickAction?: string
  /** Custom data payload */
  data?: Record<string, string>
  /** Android specific options */
  android?: {
    channelId?: string
    priority?: 'high' | 'normal'
    ttl?: number
  }
  /** iOS specific options */
  apns?: {
    badge?: number
    sound?: string
    category?: string
  }
}

interface FCMAccessToken {
  access_token: string
  expires_in: number
  token_type: string
}

// ============================================
// FCM Adapter Implementation
// ============================================

export class FCMAdapter implements PushAdapter {
  name = 'fcm'
  private config: FCMConfig
  private accessToken: string | null = null
  private tokenExpiry: number = 0
  private baseUrl: string

  constructor(config: FCMConfig) {
    this.config = config
    this.baseUrl = `https://fcm.googleapis.com/v1/projects/${config.projectId}`
  }

  /**
   * Send a simple push notification
   */
  async send(to: string, title: string, body: string): Promise<void> {
    await this.sendNotification({ to, title, body })
  }

  /**
   * Send push notification with full options
   */
  async sendNotification(options: FCMSendOptions): Promise<{
    messageId: string
  }> {
    const token = await this.getAccessToken()

    const message: Record<string, unknown> = {
      notification: {
        title: options.title,
        body: options.body,
      },
    }

    // Set target (token or topic)
    if (options.to.startsWith('/topics/')) {
      message.topic = options.to.replace('/topics/', '')
    } else {
      message.token = options.to
    }

    // Add image if provided
    if (options.imageUrl) {
      (message.notification as Record<string, unknown>).image = options.imageUrl
    }

    // Add custom data
    if (options.data) {
      message.data = options.data
    }

    // Add web push config for click action
    if (options.clickAction) {
      message.webpush = {
        fcm_options: {
          link: options.clickAction,
        },
      }
    }

    // Android specific config
    if (options.android) {
      message.android = {
        notification: {
          channel_id: options.android.channelId,
          click_action: options.clickAction,
        },
        priority: options.android.priority || 'high',
        ttl: options.android.ttl ? `${options.android.ttl}s` : undefined,
      }
    }

    // iOS specific config
    if (options.apns) {
      message.apns = {
        payload: {
          aps: {
            badge: options.apns.badge,
            sound: options.apns.sound || 'default',
            category: options.apns.category,
          },
        },
      }
    }

    const response = await fetch(`${this.baseUrl}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    })

    const data = await response.json() as { name?: string; error?: { message: string } }

    if (!response.ok) {
      throw new Error(`FCM API error: ${data.error?.message || JSON.stringify(data)}`)
    }

    return {
      messageId: data.name || '',
    }
  }

  /**
   * Send to multiple devices
   */
  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{
    successCount: number
    failureCount: number
    responses: { success: boolean; messageId?: string; error?: string }[]
  }> {
    const results = await Promise.allSettled(
      tokens.map((token) =>
        this.sendNotification({ to: token, title, body, data })
      )
    )

    const responses = results.map((result) => {
      if (result.status === 'fulfilled') {
        return { success: true, messageId: result.value.messageId }
      }
      return { success: false, error: result.reason?.message }
    })

    return {
      successCount: responses.filter((r) => r.success).length,
      failureCount: responses.filter((r) => !r.success).length,
      responses,
    }
  }

  /**
   * Send to a topic
   */
  async sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{ messageId: string }> {
    return this.sendNotification({
      to: `/topics/${topic}`,
      title,
      body,
      data,
    })
  }

  /**
   * Subscribe tokens to a topic
   */
  async subscribeToTopic(
    tokens: string[],
    topic: string
  ): Promise<{ successCount: number; failureCount: number }> {
    const token = await this.getAccessToken()

    const response = await fetch(
      `https://iid.googleapis.com/iid/v1:batchAdd`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: `/topics/${topic}`,
          registration_tokens: tokens,
        }),
      }
    )

    const data = await response.json() as { results: { error?: string }[] }

    const successCount = data.results?.filter((r) => !r.error).length || 0
    const failureCount = data.results?.filter((r) => r.error).length || 0

    return { successCount, failureCount }
  }

  /**
   * Unsubscribe tokens from a topic
   */
  async unsubscribeFromTopic(
    tokens: string[],
    topic: string
  ): Promise<{ successCount: number; failureCount: number }> {
    const token = await this.getAccessToken()

    const response = await fetch(
      `https://iid.googleapis.com/iid/v1:batchRemove`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: `/topics/${topic}`,
          registration_tokens: tokens,
        }),
      }
    )

    const data = await response.json() as { results: { error?: string }[] }

    const successCount = data.results?.filter((r) => !r.error).length || 0
    const failureCount = data.results?.filter((r) => r.error).length || 0

    return { successCount, failureCount }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async getAccessToken(): Promise<string> {
    // Return cached token if valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    // Generate JWT for service account
    const jwt = await this.createJWT()

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    const data = await response.json() as FCMAccessToken

    if (!response.ok) {
      throw new Error(`Failed to get FCM access token: ${JSON.stringify(data)}`)
    }

    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000 // Refresh 1 min early

    return this.accessToken
  }

  private async createJWT(): Promise<string> {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: this.config.clientEmail,
      sub: this.config.clientEmail,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    }

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header))
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload))
    const signatureInput = `${encodedHeader}.${encodedPayload}`

    // Sign with private key
    const crypto = await import('crypto')
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(signatureInput)
    const signature = sign.sign(this.config.privateKey, 'base64url')

    return `${signatureInput}.${signature}`
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }
}

// ============================================
// Factory Function
// ============================================

export function createFCMAdapter(config: FCMConfig): FCMAdapter {
  return new FCMAdapter(config)
}
