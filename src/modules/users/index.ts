// ============================================
// User Management Module - Public API
// ============================================

// Types
export * from './types.js'

// Validators
export * from './validators.js'

// Service
export { UserService, createUserService } from './service.js'

// Controller
export { UserController, createUserController } from './controller.js'

// Router
export { createUserRouter } from './routes.js'
export type { CreateUserRouterOptions } from './routes.js'

// OAuth Providers
export * from './oauth/index.js'

// ============================================
// Quick Setup Helper
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router } from 'express'
import { createUserRouter } from './routes.js'
import { UserModuleConfig } from './types.js'

/**
 * Quick setup for User module with sensible defaults
 *
 * @example
 * ```typescript
 * import express from 'express'
 * import { setupUserModule } from './modules/users'
 *
 * const app = express()
 * const prisma = new PrismaClient()
 *
 * app.use('/api', setupUserModule({
 *   prisma,
 *   jwtSecret: process.env.JWT_SECRET!,
 * }))
 * ```
 */
export function setupUserModule(options: {
  prisma: PrismaClient
  jwtSecret: string
  jwtExpiresIn?: string
  refreshSecret?: string
  refreshExpiresIn?: string
  basePath?: string
  frontendUrl?: string
  features?: UserModuleConfig['features']
  hooks?: UserModuleConfig['hooks']
  /** Google OAuth configuration */
  google?: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string[]
  }
}): Router {
  const config: UserModuleConfig = {
    jwt: {
      secret: options.jwtSecret,
      expiresIn: options.jwtExpiresIn || '1h',
      refreshSecret: options.refreshSecret,
      refreshExpiresIn: options.refreshExpiresIn || '7d',
    },
    frontendUrl: options.frontendUrl,
    features: {
      registration: true,
      emailVerification: false,
      passwordReset: true,
      apiKeys: true,
      softDelete: true,
      oauth: !!options.google,
      ...options.features,
    },
    oauth: options.google ? { google: options.google } : undefined,
    hooks: options.hooks,
  }

  return createUserRouter({
    prisma: options.prisma,
    config,
  })
}
