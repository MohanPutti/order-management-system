import { Router, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { UserService, createUserService } from './service.js'
import { UserController, createUserController } from './controller.js'
import { UserModuleConfig } from './types.js'
import { createGoogleOAuthService, GoogleOAuthService } from './oauth/index.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { sendSuccess } from '../../shared/utils/index.js'
import { BadRequestError } from '../../shared/errors/index.js'
import {
  validateBody,
  validateQuery,
  validateParams,
  createAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'
import {
  registerSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  resetPasswordRequestSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  createRoleSchema,
  updateRoleSchema,
  createApiKeySchema,
  userQuerySchema,
  idParamSchema,
} from './validators.js'

// ============================================
// User Routes Factory
// ============================================

export interface CreateUserRouterOptions {
  prisma: PrismaClient
  config: UserModuleConfig
}

export function createUserRouter(options: CreateUserRouterOptions): Router {
  const { prisma, config } = options
  const router = Router()

  // Create service and controller
  const userService = createUserService(prisma, config)
  const controller = createUserController(userService)

  // Auth middleware
  const authenticate = createAuthMiddleware({
    verifyToken: async (token) => {
      const user = await userService.verifyAccessToken(token)
      if (!user) return undefined
      return {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r) => r.role.name),
        permissions: user.permissions,
      }
    },
  })

  // Apply custom middleware if provided
  if (config.middleware) {
    config.middleware.forEach((mw) => router.use(mw))
  }

  // ==========================================
  // Public Routes (No Auth)
  // ==========================================

  // Auth routes
  router.post('/auth/register', validateBody(registerSchema), controller.register)
  router.post('/auth/login', validateBody(loginSchema), controller.login)
  router.post('/auth/refresh', validateBody(refreshTokenSchema), controller.refreshTokens)
  router.post('/auth/forgot-password', validateBody(resetPasswordRequestSchema), controller.requestPasswordReset)
  router.post('/auth/reset-password', validateBody(resetPasswordSchema), controller.resetPassword)

  // ==========================================
  // OAuth Routes
  // ==========================================

  // Google OAuth
  if (config.oauth?.google && config.features?.oauth !== false) {
    const googleOAuth = createGoogleOAuthService(prisma, config.oauth.google)

    // Redirect to Google
    router.get('/auth/google', (_req: AuthenticatedRequest, res: Response) => {
      const state = Math.random().toString(36).substring(7) // Simple state for CSRF protection
      const authUrl = googleOAuth.getAuthorizationUrl(state)
      res.redirect(authUrl)
    })

    // Google callback
    router.get('/auth/google/callback', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const code = req.query.code as string | undefined
        const error = req.query.error as string | undefined

        // Get frontend URL from config or use default
        const frontendUrl = config.frontendUrl || 'http://localhost:5173'

        if (error) {
          return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(`Google OAuth error: ${error}`)}`)
        }

        if (!code) {
          return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('No authorization code provided')}`)
        }

        // Handle the callback - creates or finds user
        const result = await googleOAuth.handleCallback(code)

        // Login and generate JWT tokens
        const loginResult = await userService.loginWithOAuth(result.user.id)

        // Call afterOAuthLogin hook
        if (config.hooks?.afterOAuthLogin) {
          const user = await userService.findById(result.user.id)
          if (user) {
            await config.hooks.afterOAuthLogin(user, 'google', result.user.isNew)
          }
        }

        // Redirect to frontend with token in URL fragment (more secure than query params)
        const redirectUrl = `${frontendUrl}/auth/callback#token=${loginResult.tokens.accessToken}`
        res.redirect(redirectUrl)
      } catch (err) {
        const frontendUrl = config.frontendUrl || 'http://localhost:5173'
        const errorMsg = err instanceof Error ? err.message : 'OAuth authentication failed'
        res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`)
      }
    })
  }

  // ==========================================
  // Protected Routes (Requires Auth)
  // ==========================================

  // Current user routes
  router.get('/me', authenticate, controller.getMe)
  router.put('/me', authenticate, validateBody(updateUserSchema), controller.updateMe)
  router.post('/auth/logout', authenticate, controller.logout)
  router.post('/auth/change-password', authenticate, validateBody(changePasswordSchema), controller.changePassword)

  // API Keys routes
  router.get('/api-keys', authenticate, controller.listApiKeys)
  router.post('/api-keys', authenticate, validateBody(createApiKeySchema), controller.createApiKey)
  router.delete('/api-keys/:keyId', authenticate, controller.revokeApiKey)

  // ==========================================
  // Admin Routes (Requires Permissions)
  // ==========================================

  // Users management
  router.get(
    '/users',
    authenticate,
    requirePermissions('users.read'),
    validateQuery(userQuerySchema),
    controller.list
  )

  router.post(
    '/users',
    authenticate,
    requirePermissions('users.create'),
    validateBody(createUserSchema),
    controller.create
  )

  router.get(
    '/users/:id',
    authenticate,
    requirePermissions('users.read'),
    validateParams(idParamSchema),
    controller.getById
  )

  router.put(
    '/users/:id',
    authenticate,
    requirePermissions('users.update'),
    validateParams(idParamSchema),
    validateBody(updateUserSchema),
    controller.update
  )

  router.delete(
    '/users/:id',
    authenticate,
    requirePermissions('users.delete'),
    validateParams(idParamSchema),
    controller.delete
  )

  // User role management
  router.post(
    '/users/:id/roles',
    authenticate,
    requirePermissions('users.update'),
    validateParams(idParamSchema),
    controller.assignRole
  )

  router.delete(
    '/users/:id/roles/:roleId',
    authenticate,
    requirePermissions('users.update'),
    controller.removeRole
  )

  // Roles management
  router.get('/roles', authenticate, requirePermissions('roles.read'), controller.listRoles)
  router.post('/roles', authenticate, requirePermissions('roles.create'), validateBody(createRoleSchema), controller.createRole)
  router.get('/roles/:id', authenticate, requirePermissions('roles.read'), validateParams(idParamSchema), controller.getRoleById)
  router.put('/roles/:id', authenticate, requirePermissions('roles.update'), validateParams(idParamSchema), validateBody(updateRoleSchema), controller.updateRole)
  router.delete('/roles/:id', authenticate, requirePermissions('roles.delete'), validateParams(idParamSchema), controller.deleteRole)

  // Permissions (read-only)
  router.get('/permissions', authenticate, requirePermissions('roles.read'), controller.listPermissions)

  // Error handler
  router.use(errorHandler)

  return router
}

// ============================================
// Standalone Service Export
// ============================================

export { createUserService, UserService }
export { createUserController, UserController }
