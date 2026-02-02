// ============================================
// Facebook OAuth Provider
// ============================================

import { PrismaClient } from '@prisma/client'
import { UnauthorizedError, BadRequestError } from '../../../shared/errors/index.js'

// ============================================
// Types
// ============================================

export interface FacebookOAuthConfig {
  appId: string
  appSecret: string
  redirectUri: string
  scopes?: string[]
  /** Graph API version (default: v18.0) */
  apiVersion?: string
}

export interface FacebookUserInfo {
  id: string
  email?: string
  name?: string
  first_name?: string
  last_name?: string
  picture?: {
    data: {
      url: string
      width: number
      height: number
    }
  }
}

export interface FacebookTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface FacebookDebugTokenResponse {
  data: {
    app_id: string
    type: string
    application: string
    data_access_expires_at: number
    expires_at: number
    is_valid: boolean
    scopes: string[]
    user_id: string
  }
}

// ============================================
// Facebook OAuth Service
// ============================================

export class FacebookOAuthService {
  private config: FacebookOAuthConfig
  private prisma: PrismaClient
  private apiVersion: string

  private readonly AUTH_URL = 'https://www.facebook.com/v18.0/dialog/oauth'
  private readonly TOKEN_URL = 'https://graph.facebook.com/v18.0/oauth/access_token'

  constructor(prisma: PrismaClient, config: FacebookOAuthConfig) {
    this.prisma = prisma
    this.apiVersion = config.apiVersion || 'v18.0'
    this.config = {
      ...config,
      scopes: config.scopes || ['email', 'public_profile'],
    }
  }

  private get graphUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}`
  }

  /**
   * Generate the Facebook OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes!.join(','),
      ...(state && { state }),
    })

    return `${this.AUTH_URL}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<FacebookTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.redirectUri,
      code,
    })

    const response = await fetch(`${this.TOKEN_URL}?${params.toString()}`)

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } }
      throw new UnauthorizedError(`Facebook OAuth failed: ${error.error?.message || 'Unknown error'}`)
    }

    return response.json() as Promise<FacebookTokenResponse>
  }

  /**
   * Get user info from Facebook using access token
   */
  async getUserInfo(accessToken: string): Promise<FacebookUserInfo> {
    const fields = 'id,email,name,first_name,last_name,picture.type(large)'
    const response = await fetch(
      `${this.graphUrl}/me?fields=${fields}&access_token=${accessToken}`
    )

    if (!response.ok) {
      throw new UnauthorizedError('Failed to get user info from Facebook')
    }

    return response.json() as Promise<FacebookUserInfo>
  }

  /**
   * Debug/validate access token
   */
  async debugToken(accessToken: string): Promise<FacebookDebugTokenResponse> {
    const appAccessToken = `${this.config.appId}|${this.config.appSecret}`
    const response = await fetch(
      `${this.graphUrl}/debug_token?input_token=${accessToken}&access_token=${appAccessToken}`
    )

    if (!response.ok) {
      throw new UnauthorizedError('Failed to validate Facebook token')
    }

    return response.json() as Promise<FacebookDebugTokenResponse>
  }

  /**
   * Handle the OAuth callback - authenticate or register user
   */
  async handleCallback(code: string): Promise<{
    user: {
      id: string
      email: string
      firstName: string | null
      lastName: string | null
      avatar: string | null
      isNew: boolean
    }
    facebookTokens: FacebookTokenResponse
  }> {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code)

    // Get user info
    const facebookUser = await this.getUserInfo(tokens.access_token)

    if (!facebookUser.email) {
      throw new BadRequestError('Unable to retrieve email from Facebook. Please grant email permission.')
    }

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email: facebookUser.email },
    })

    let isNew = false

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email: facebookUser.email,
          password: '', // No password for OAuth users
          firstName: facebookUser.first_name || null,
          lastName: facebookUser.last_name || null,
          avatar: facebookUser.picture?.data?.url || null,
          isVerified: true, // Facebook verified the email
          verifiedAt: new Date(),
          metadata: {
            facebookId: facebookUser.id,
            oauthProvider: 'facebook',
          },
        },
      })
      isNew = true
    } else {
      // Update existing user with Facebook info if missing
      const updates: Record<string, unknown> = {}

      if (!user.avatar && facebookUser.picture?.data?.url) {
        updates.avatar = facebookUser.picture.data.url
      }
      if (!user.firstName && facebookUser.first_name) {
        updates.firstName = facebookUser.first_name
      }
      if (!user.lastName && facebookUser.last_name) {
        updates.lastName = facebookUser.last_name
      }
      if (!user.isVerified) {
        updates.isVerified = true
        updates.verifiedAt = new Date()
      }

      // Store Facebook ID in metadata
      const currentMetadata = (user.metadata as Record<string, unknown>) || {}
      if (!currentMetadata.facebookId) {
        updates.metadata = {
          ...currentMetadata,
          facebookId: facebookUser.id,
          oauthProvider: 'facebook',
        }
      }

      if (Object.keys(updates).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updates,
        })
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isNew,
      },
      facebookTokens: tokens,
    }
  }

  /**
   * Get long-lived access token (valid for 60 days)
   */
  async getLongLivedToken(shortLivedToken: string): Promise<FacebookTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: shortLivedToken,
    })

    const response = await fetch(`${this.TOKEN_URL}?${params.toString()}`)

    if (!response.ok) {
      throw new UnauthorizedError('Failed to get long-lived token from Facebook')
    }

    return response.json() as Promise<FacebookTokenResponse>
  }
}

// ============================================
// Factory Function
// ============================================

export function createFacebookOAuthService(
  prisma: PrismaClient,
  config: FacebookOAuthConfig
): FacebookOAuthService {
  return new FacebookOAuthService(prisma, config)
}
