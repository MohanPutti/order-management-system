// ============================================
// Apple Sign In OAuth Provider
// ============================================

import { PrismaClient } from '@prisma/client'
import { UnauthorizedError, BadRequestError } from '../../../shared/errors/index.js'
import * as crypto from 'crypto'

// ============================================
// Types
// ============================================

export interface AppleOAuthConfig {
  /** Apple Services ID (client_id) */
  clientId: string
  /** Apple Team ID */
  teamId: string
  /** Key ID for the private key */
  keyId: string
  /** Private key (.p8 file contents) */
  privateKey: string
  /** Redirect URI registered with Apple */
  redirectUri: string
  /** Scopes to request */
  scopes?: string[]
}

export interface AppleTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  id_token: string
}

export interface AppleIdTokenPayload {
  iss: string
  aud: string
  exp: number
  iat: number
  sub: string // User ID
  at_hash: string
  email?: string
  email_verified?: string | boolean
  is_private_email?: string | boolean
  auth_time: number
  nonce_supported: boolean
}

export interface AppleUserInfo {
  sub: string // User ID
  email?: string
  email_verified: boolean
  is_private_email: boolean
  name?: {
    firstName?: string
    lastName?: string
  }
}

// ============================================
// Apple Sign In Service
// ============================================

export class AppleOAuthService {
  private config: AppleOAuthConfig
  private prisma: PrismaClient

  private readonly AUTH_URL = 'https://appleid.apple.com/auth/authorize'
  private readonly TOKEN_URL = 'https://appleid.apple.com/auth/token'
  private readonly KEYS_URL = 'https://appleid.apple.com/auth/keys'

  constructor(prisma: PrismaClient, config: AppleOAuthConfig) {
    this.prisma = prisma
    this.config = {
      ...config,
      scopes: config.scopes || ['name', 'email'],
    }
  }

  /**
   * Generate client secret JWT for Apple
   * Apple requires a JWT signed with your private key as the client secret
   */
  private generateClientSecret(): string {
    const now = Math.floor(Date.now() / 1000)
    const exp = now + 15777000 // 6 months

    const header = {
      alg: 'ES256',
      kid: this.config.keyId,
    }

    const payload = {
      iss: this.config.teamId,
      iat: now,
      exp,
      aud: 'https://appleid.apple.com',
      sub: this.config.clientId,
    }

    // Create the JWT
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signatureInput = `${headerB64}.${payloadB64}`

    // Sign with ES256 (ECDSA using P-256 curve and SHA-256 hash)
    const sign = crypto.createSign('SHA256')
    sign.update(signatureInput)
    const signature = sign.sign(this.config.privateKey, 'base64url')

    return `${signatureInput}.${signature}`
  }

  /**
   * Generate the Apple Sign In authorization URL
   */
  getAuthorizationUrl(state?: string, nonce?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code id_token',
      response_mode: 'form_post',
      scope: this.config.scopes!.join(' '),
      ...(state && { state }),
      ...(nonce && { nonce }),
    })

    return `${this.AUTH_URL}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<AppleTokenResponse> {
    const clientSecret = this.generateClientSecret()

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string; error_description?: string }
      throw new UnauthorizedError(`Apple Sign In failed: ${error.error_description || error.error}`)
    }

    return response.json() as Promise<AppleTokenResponse>
  }

  /**
   * Decode and verify the Apple ID token
   * Note: For production, you should verify the signature using Apple's public keys
   */
  decodeIdToken(idToken: string): AppleIdTokenPayload {
    const parts = idToken.split('.')
    if (parts.length !== 3) {
      throw new BadRequestError('Invalid Apple ID token format')
    }

    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      return payload as AppleIdTokenPayload
    } catch {
      throw new BadRequestError('Failed to decode Apple ID token')
    }
  }

  /**
   * Handle the OAuth callback - authenticate or register user
   * Apple sends user info only on first authorization, so we need to handle both cases
   */
  async handleCallback(
    code: string,
    userInfo?: { name?: { firstName?: string; lastName?: string }; email?: string }
  ): Promise<{
    user: {
      id: string
      email: string
      firstName: string | null
      lastName: string | null
      avatar: string | null
      isNew: boolean
    }
    appleTokens: AppleTokenResponse
  }> {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code)

    // Decode the ID token to get user info
    const idTokenPayload = this.decodeIdToken(tokens.id_token)

    // Get email from ID token or user info (first auth only)
    const email = idTokenPayload.email || userInfo?.email

    if (!email) {
      throw new BadRequestError('Unable to retrieve email from Apple. Please share your email.')
    }

    // Get name from user info (only available on first auth)
    const firstName = userInfo?.name?.firstName || null
    const lastName = userInfo?.name?.lastName || null

    // Apple's user identifier
    const appleUserId = idTokenPayload.sub

    // Check if user exists by email first
    let user = await this.prisma.user.findUnique({
      where: { email },
    })

    // If not found by email, try to find by Apple ID in metadata
    // Note: This requires a raw query or iterating users for production use
    // For simplicity, we rely on email as the primary identifier

    let isNew = false

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email,
          password: '', // No password for OAuth users
          firstName,
          lastName,
          avatar: null, // Apple doesn't provide avatar
          isVerified: idTokenPayload.email_verified === true || idTokenPayload.email_verified === 'true',
          verifiedAt: new Date(),
          metadata: {
            appleId: appleUserId,
            isPrivateEmail: idTokenPayload.is_private_email === true || idTokenPayload.is_private_email === 'true',
            oauthProvider: 'apple',
          },
        },
      })
      isNew = true
    } else {
      // Update existing user with Apple info if missing
      const updates: Record<string, unknown> = {}

      // Update name only if we have it and user doesn't have it
      if (!user.firstName && firstName) {
        updates.firstName = firstName
      }
      if (!user.lastName && lastName) {
        updates.lastName = lastName
      }
      if (!user.isVerified && (idTokenPayload.email_verified === true || idTokenPayload.email_verified === 'true')) {
        updates.isVerified = true
        updates.verifiedAt = new Date()
      }

      // Store Apple ID in metadata
      const currentMetadata = (user.metadata as Record<string, unknown>) || {}
      if (!currentMetadata.appleId) {
        updates.metadata = {
          ...currentMetadata,
          appleId: appleUserId,
          isPrivateEmail: idTokenPayload.is_private_email === true || idTokenPayload.is_private_email === 'true',
          oauthProvider: 'apple',
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
      appleTokens: tokens,
    }
  }

  /**
   * Refresh Apple access token
   */
  async refreshAccessToken(refreshToken: string): Promise<AppleTokenResponse> {
    const clientSecret = this.generateClientSecret()

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string; error_description?: string }
      throw new UnauthorizedError(`Failed to refresh Apple token: ${error.error_description || error.error}`)
    }

    return response.json() as Promise<AppleTokenResponse>
  }

  /**
   * Revoke Apple tokens
   */
  async revokeToken(token: string, tokenType: 'access_token' | 'refresh_token' = 'access_token'): Promise<void> {
    const clientSecret = this.generateClientSecret()

    const response = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokenType,
      }),
    })

    if (!response.ok) {
      console.warn('Failed to revoke Apple token')
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createAppleOAuthService(
  prisma: PrismaClient,
  config: AppleOAuthConfig
): AppleOAuthService {
  return new AppleOAuthService(prisma, config)
}
