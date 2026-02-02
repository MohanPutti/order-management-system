import { Response } from 'express'
import { ApiResponse, PaginationParams } from '../types/index.js'
import { AppError, isAppError } from '../errors/index.js'

// ============================================
// Response Helpers
// ============================================

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: ApiResponse['meta']
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  }
  res.status(statusCode).json(response)
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  error: AppError | Error | string,
  statusCode?: number
): void {
  if (isAppError(error)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    }
    res.status(error.statusCode).json(response)
  } else if (error instanceof Error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    }
    res.status(statusCode || 500).json(response)
  } else {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: String(error),
      },
    }
    res.status(statusCode || 500).json(response)
  }
}

/**
 * Send paginated response
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  params: PaginationParams
): void {
  const page = params.page || 1
  const limit = params.limit || 10
  const totalPages = Math.ceil(total / limit)

  sendSuccess(res, data, 200, {
    page,
    limit,
    total,
    totalPages,
  })
}

// ============================================
// Pagination Helpers
// ============================================

/**
 * Parse pagination params from query
 */
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  return {
    page: Math.max(1, parseInt(String(query.page || '1'), 10)),
    limit: Math.min(100, Math.max(1, parseInt(String(query.limit || '10'), 10))),
    sortBy: query.sortBy as string | undefined,
    sortOrder: (query.sortOrder as 'asc' | 'desc') || 'desc',
  }
}

/**
 * Calculate skip for Prisma
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit
}

// ============================================
// String Helpers
// ============================================

/**
 * Generate a random string
 */
export function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Generate a slug from string
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Mask sensitive data (e.g., email, phone)
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const maskedLocal = local.length > 2
    ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
    : '*'.repeat(local.length)
  return `${maskedLocal}@${domain}`
}

// ============================================
// Object Helpers
// ============================================

/**
 * Remove undefined values from object
 */
export function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

/**
 * Pick specific keys from object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce((result, key) => {
    if (key in obj) {
      result[key] = obj[key]
    }
    return result
  }, {} as Pick<T, K>)
}

/**
 * Omit specific keys from object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj }
  keys.forEach((key) => delete result[key])
  return result
}

// ============================================
// Date Helpers
// ============================================

/**
 * Check if date is expired
 */
export function isExpired(date: Date): boolean {
  return new Date() > date
}

/**
 * Add time to date
 */
export function addTime(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms)
}

/**
 * Parse duration string (e.g., '7d', '24h', '30m') to milliseconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhdw])$/)
  if (!match) throw new Error(`Invalid duration format: ${duration}`)

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  }

  return value * multipliers[unit]
}

// ============================================
// Async Helpers
// ============================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number; backoff?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 2 } = options
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        await sleep(delay * Math.pow(backoff, attempt - 1))
      }
    }
  }

  throw lastError
}
