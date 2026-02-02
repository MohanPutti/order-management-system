// ============================================
// GitHub OAuth Provider
// ============================================

import { PrismaClient } from '@prisma/client'
import { UnauthorizedError, BadRequestError } from '../../../shared/errors/index.js'

// ============================================
// Types
// ============================================

export interface GitHubOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export interface GitHubUserInfo {
  id: number
  login: string
  email: string | null
  name: string | null
  avatar_url: string
  bio: string | null
  location: string | null
  company: string | null
}

export interface GitHubTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

export interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
  visibility: string | null
}

// ============================================
// GitHub OAuth Service
// ============================================

export class GitHubOAuthService {
  private config: GitHubOAuthConfig
  private prisma: PrismaClient

  private readonly AUTH_URL = 'https://github.com/login/oauth/authorize'
  private readonly TOKEN_URL = 'https://github.com/login/oauth/access_token'
  private readonly USERINFO_URL = 'https://api.github.com/user'
  private readonly EMAILS_URL = 'https://api.github.com/user/emails'

  constructor(prisma: PrismaClient, config: GitHubOAuthConfig) {
    this.prisma = prisma
    this.config = {
      ...config,
      scopes: config.scopes || ['user:email', 'read:user'],
    }
  }

  /**
   * Generate the GitHub OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes!.join(' '),
      ...(state && { state }),
    })

    return `${this.AUTH_URL}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GitHubTokenResponse> {
    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      }),
    })

    if (!response.ok) {
      throw new UnauthorizedError('GitHub OAuth failed: Unable to exchange code')
    }

    const data = await response.json() as GitHubTokenResponse & { error_description?: string; error?: string }

    if (data.error) {
      throw new UnauthorizedError(`GitHub OAuth failed: ${data.error_description || data.error}`)
    }

    return data
  }

  /**
   * Get user info from GitHub using access token
   */
  async getUserInfo(accessToken: string): Promise<GitHubUserInfo> {
    const response = await fetch(this.USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new UnauthorizedError('Failed to get user info from GitHub')
    }

    return response.json() as Promise<GitHubUserInfo>
  }

  /**
   * Get user's primary verified email from GitHub
   */
  async getUserEmail(accessToken: string): Promise<string | null> {
    const response = await fetch(this.EMAILS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      return null
    }

    const emails = await response.json() as GitHubEmail[]

    // Find primary verified email
    const primaryEmail = emails.find(e => e.primary && e.verified)
    if (primaryEmail) {
      return primaryEmail.email
    }

    // Fall back to any verified email
    const verifiedEmail = emails.find(e => e.verified)
    return verifiedEmail?.email || null
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
    githubTokens: GitHubTokenResponse
  }> {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code)

    // Get user info
    const githubUser = await this.getUserInfo(tokens.access_token)

    // Get email if not in profile
    let email = githubUser.email
    if (!email) {
      email = await this.getUserEmail(tokens.access_token)
    }

    if (!email) {
      throw new BadRequestError('Unable to retrieve email from GitHub. Please ensure your email is public or grant email access.')
    }

    // Parse name into first/last
    let firstName: string | null = null
    let lastName: string | null = null
    if (githubUser.name) {
      const nameParts = githubUser.name.split(' ')
      firstName = nameParts[0] || null
      lastName = nameParts.slice(1).join(' ') || null
    }

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email },
    })

    let isNew = false

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          email,
          password: '', // No password for OAuth users
          firstName,
          lastName,
          avatar: githubUser.avatar_url || null,
          isVerified: true, // GitHub verified the email
          verifiedAt: new Date(),
          metadata: {
            githubId: githubUser.id.toString(),
            githubUsername: githubUser.login,
            oauthProvider: 'github',
          },
        },
      })
      isNew = true
    } else {
      // Update existing user with GitHub info if missing
      const updates: Record<string, unknown> = {}

      if (!user.avatar && githubUser.avatar_url) {
        updates.avatar = githubUser.avatar_url
      }
      if (!user.firstName && firstName) {
        updates.firstName = firstName
      }
      if (!user.lastName && lastName) {
        updates.lastName = lastName
      }
      if (!user.isVerified) {
        updates.isVerified = true
        updates.verifiedAt = new Date()
      }

      // Store GitHub ID in metadata
      const currentMetadata = (user.metadata as Record<string, unknown>) || {}
      if (!currentMetadata.githubId) {
        updates.metadata = {
          ...currentMetadata,
          githubId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          oauthProvider: 'github',
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
      githubTokens: tokens,
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createGitHubOAuthService(
  prisma: PrismaClient,
  config: GitHubOAuthConfig
): GitHubOAuthService {
  return new GitHubOAuthService(prisma, config)
}
