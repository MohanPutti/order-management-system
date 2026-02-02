// ============================================
// Google OAuth Provider
// ============================================

import { PrismaClient } from '@prisma/client'
import { UnauthorizedError, BadRequestError } from '../../../shared/errors/index.js'

// ============================================
// Types
// ============================================

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name: string
  family_name: string
  picture: string
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
  id_token?: string
}

// ============================================
// Google OAuth Service
// ============================================

export class GoogleOAuthService {
  private config: GoogleOAuthConfig
  private prisma: PrismaClient

  private readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token'
  private readonly USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

  constructor(prisma: PrismaClient, config: GoogleOAuthConfig) {
    this.prisma = prisma
    this.config = {
      ...config,
      scopes: config.scopes || ['openid', 'email', 'profile'],
    }
  }

  /**
   * Generate the Google OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes!.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      ...(state && { state }),
    })

    return `${this.AUTH_URL}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
        code,
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error_description?: string; error?: string }
      throw new UnauthorizedError(`Google OAuth failed: ${error.error_description || error.error}`)
    }

    return response.json() as Promise<GoogleTokenResponse>
  }

  /**
   * Get user info from Google using access token
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(this.USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new UnauthorizedError('Failed to get user info from Google')
    }

    return response.json() as Promise<GoogleUserInfo>
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
    googleTokens: GoogleTokenResponse
  }> {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code)

    // Get user info
    const googleUser = await this.getUserInfo(tokens.access_token)

    if (!googleUser.verified_email) {
      throw new BadRequestError('Google email is not verified')
    }

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    })

    let isNew = false

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          password: '', // No password for OAuth users
          firstName: googleUser.given_name || null,
          lastName: googleUser.family_name || null,
          avatar: googleUser.picture || null,
          isVerified: true, // Google already verified the email
          verifiedAt: new Date(),
          metadata: {
            googleId: googleUser.id,
            oauthProvider: 'google',
          },
        },
      })
      isNew = true
    } else {
      // Update existing user with Google info if missing
      const updates: Record<string, unknown> = {}

      if (!user.avatar && googleUser.picture) {
        updates.avatar = googleUser.picture
      }
      if (!user.firstName && googleUser.given_name) {
        updates.firstName = googleUser.given_name
      }
      if (!user.lastName && googleUser.family_name) {
        updates.lastName = googleUser.family_name
      }
      if (!user.isVerified) {
        updates.isVerified = true
        updates.verifiedAt = new Date()
      }

      // Store Google ID in metadata
      const currentMetadata = (user.metadata as Record<string, unknown>) || {}
      if (!currentMetadata.googleId) {
        updates.metadata = {
          ...currentMetadata,
          googleId: googleUser.id,
          oauthProvider: 'google',
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
      googleTokens: tokens,
    }
  }

  /**
   * Refresh Google access token
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error_description?: string; error?: string }
      throw new UnauthorizedError(`Failed to refresh token: ${error.error_description || error.error}`)
    }

    return response.json() as Promise<GoogleTokenResponse>
  }

  /**
   * Revoke Google access token
   */
  async revokeToken(token: string): Promise<void> {
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      console.warn('Failed to revoke Google token')
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createGoogleOAuthService(
  prisma: PrismaClient,
  config: GoogleOAuthConfig
): GoogleOAuthService {
  return new GoogleOAuthService(prisma, config)
}
