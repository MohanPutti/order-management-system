import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { AppError, ValidationError, UnauthorizedError } from '../errors/index.js'
import { sendError } from '../utils/index.js'
import { AuthenticatedRequest } from '../types/index.js'

// ============================================
// Error Handler Middleware
// ============================================

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', error)

  if (error instanceof AppError) {
    sendError(res, error)
    return
  }

  if (error instanceof ZodError) {
    const validationError = new ValidationError('Validation failed', error.errors)
    sendError(res, validationError)
    return
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as { code?: string; meta?: { target?: string[] } }

    if (prismaError.code === 'P2002') {
      const field = prismaError.meta?.target?.[0] || 'field'
      sendError(res, new AppError(`${field} already exists`, 'DUPLICATE_ENTRY', 409))
      return
    }

    if (prismaError.code === 'P2025') {
      sendError(res, new AppError('Record not found', 'NOT_FOUND', 404))
      return
    }
  }

  // Generic error
  sendError(res, new AppError('Internal server error', 'INTERNAL_ERROR', 500))
}

// ============================================
// Validation Middleware
// ============================================

/**
 * Validate request body with Zod schema
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Validate request query with Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as Record<string, string>
      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Validate request params with Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as Record<string, string>
      next()
    } catch (error) {
      next(error)
    }
  }
}

// ============================================
// Auth Middleware Factory
// ============================================

export interface AuthMiddlewareConfig {
  /** Function to verify JWT token and return user */
  verifyToken: (token: string) => Promise<AuthenticatedRequest['user']>
  /** Header name for token (default: 'authorization') */
  headerName?: string
  /** Token prefix (default: 'Bearer') */
  tokenPrefix?: string
}

/**
 * Create auth middleware with custom token verification
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const { verifyToken, headerName = 'authorization', tokenPrefix = 'Bearer' } = config

  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers[headerName.toLowerCase()]

      if (!authHeader || typeof authHeader !== 'string') {
        throw new UnauthorizedError('No token provided')
      }

      const parts = authHeader.split(' ')

      if (parts.length !== 2 || parts[0] !== tokenPrefix) {
        throw new UnauthorizedError('Invalid token format')
      }

      const token = parts[1]
      const user = await verifyToken(token)

      if (!user) {
        throw new UnauthorizedError('Invalid token')
      }

      req.user = user
      req.token = token
      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Optional auth - doesn't fail if no token
 */
export function createOptionalAuthMiddleware(config: AuthMiddlewareConfig) {
  const { verifyToken, headerName = 'authorization', tokenPrefix = 'Bearer' } = config

  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers[headerName.toLowerCase()]

      if (!authHeader || typeof authHeader !== 'string') {
        return next()
      }

      const parts = authHeader.split(' ')

      if (parts.length !== 2 || parts[0] !== tokenPrefix) {
        return next()
      }

      const token = parts[1]
      const user = await verifyToken(token)

      if (user) {
        req.user = user
        req.token = token
      }

      next()
    } catch {
      // Silently fail for optional auth
      next()
    }
  }
}

// ============================================
// Permission Middleware Factory
// ============================================

/**
 * Check if user has required permissions
 */
export function requirePermissions(...permissions: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'))
    }

    const userPermissions = req.user.permissions || []
    const hasAllPermissions = permissions.every((p) => userPermissions.includes(p))

    if (!hasAllPermissions) {
      return next(new AppError('Insufficient permissions', 'FORBIDDEN', 403))
    }

    next()
  }
}

/**
 * Check if user has any of the required permissions
 */
export function requireAnyPermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'))
    }

    const userPermissions = req.user.permissions || []
    const hasAnyPermission = permissions.some((p) => userPermissions.includes(p))

    if (!hasAnyPermission) {
      return next(new AppError('Insufficient permissions', 'FORBIDDEN', 403))
    }

    next()
  }
}

/**
 * Check if user has required roles
 */
export function requireRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'))
    }

    const userRoles = req.user.roles || []
    const hasAllRoles = roles.every((r) => userRoles.includes(r))

    if (!hasAllRoles) {
      return next(new AppError('Insufficient role', 'FORBIDDEN', 403))
    }

    next()
  }
}

// ============================================
// Rate Limiting Middleware
// ============================================

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number }
}

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs?: number
  /** Max requests per window */
  max?: number
  /** Key generator function */
  keyGenerator?: (req: Request) => string
  /** Skip function */
  skip?: (req: Request) => boolean
}

/**
 * Simple in-memory rate limiter
 */
export function createRateLimiter(config: RateLimitConfig = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100,
    keyGenerator = (req) => req.ip || 'unknown',
    skip = () => false,
  } = config

  const store: RateLimitStore = {}

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now()
    Object.keys(store).forEach((key) => {
      if (store[key].resetTime < now) {
        delete store[key]
      }
    })
  }, windowMs)

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip(req)) {
      return next()
    }

    const key = keyGenerator(req)
    const now = Date.now()

    if (!store[key] || store[key].resetTime < now) {
      store[key] = { count: 1, resetTime: now + windowMs }
    } else {
      store[key].count++
    }

    const remaining = Math.max(0, max - store[key].count)
    const resetTime = store[key].resetTime

    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', remaining)
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000))

    if (store[key].count > max) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      })
      return
    }

    next()
  }
}

// ============================================
// Request Logger Middleware
// ============================================

export interface LoggerConfig {
  /** Log function (default: console.log) */
  logger?: (message: string) => void
  /** Skip logging for certain requests */
  skip?: (req: Request) => boolean
}

export function createRequestLogger(config: LoggerConfig = {}) {
  const { logger = console.log, skip = () => false } = config

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip(req)) {
      return next()
    }

    const start = Date.now()

    res.on('finish', () => {
      const duration = Date.now() - start
      const message = `${req.method} ${req.path} ${res.statusCode} - ${duration}ms`
      logger(message)
    })

    next()
  }
}
