// ============================================
// OAuth Providers - Public API
// ============================================

export * from './google.js'
export * from './github.js'
export * from './facebook.js'
export * from './apple.js'

// ============================================
// OAuth Provider Interface
// ============================================

export interface OAuthProvider {
  name: string
  getAuthorizationUrl(state?: string): string
  handleCallback(code: string): Promise<{
    user: {
      id: string
      email: string
      firstName: string | null
      lastName: string | null
      avatar: string | null
      isNew: boolean
    }
    providerTokens: {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
  }>
}

// ============================================
// OAuth Config Types
// ============================================

export interface OAuthConfig {
  google?: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string[]
  }
  github?: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string[]
  }
  facebook?: {
    appId: string
    appSecret: string
    redirectUri: string
    scopes?: string[]
    apiVersion?: string
  }
  apple?: {
    clientId: string
    teamId: string
    keyId: string
    privateKey: string
    redirectUri: string
    scopes?: string[]
  }
}

// ============================================
// OAuth Provider Factory
// ============================================

import { PrismaClient } from '@prisma/client'
import { createGoogleOAuthService, GoogleOAuthService } from './google.js'
import { createGitHubOAuthService, GitHubOAuthService } from './github.js'
import { createFacebookOAuthService, FacebookOAuthService } from './facebook.js'
import { createAppleOAuthService, AppleOAuthService } from './apple.js'

export interface OAuthServices {
  google?: GoogleOAuthService
  github?: GitHubOAuthService
  facebook?: FacebookOAuthService
  apple?: AppleOAuthService
}

/**
 * Create OAuth services based on configuration
 */
export function createOAuthServices(
  prisma: PrismaClient,
  config: OAuthConfig
): OAuthServices {
  const services: OAuthServices = {}

  if (config.google) {
    services.google = createGoogleOAuthService(prisma, config.google)
  }

  if (config.github) {
    services.github = createGitHubOAuthService(prisma, config.github)
  }

  if (config.facebook) {
    services.facebook = createFacebookOAuthService(prisma, config.facebook)
  }

  if (config.apple) {
    services.apple = createAppleOAuthService(prisma, config.apple)
  }

  return services
}
