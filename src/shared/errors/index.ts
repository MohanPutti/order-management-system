/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * 400 - Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: unknown) {
    super(message, 'BAD_REQUEST', 400, details)
    this.name = 'BadRequestError'
  }
}

/**
 * 401 - Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: unknown) {
    super(message, 'UNAUTHORIZED', 401, details)
    this.name = 'UnauthorizedError'
  }
}

/**
 * 403 - Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: unknown) {
    super(message, 'FORBIDDEN', 403, details)
    this.name = 'ForbiddenError'
  }
}

/**
 * 404 - Not Found
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: unknown) {
    super(message, 'NOT_FOUND', 404, details)
    this.name = 'NotFoundError'
  }
}

/**
 * 409 - Conflict
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', details?: unknown) {
    super(message, 'CONFLICT', 409, details)
    this.name = 'ConflictError'
  }
}

/**
 * 422 - Validation Error
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 'VALIDATION_ERROR', 422, details)
    this.name = 'ValidationError'
  }
}

/**
 * 429 - Too Many Requests
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: unknown) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details)
    this.name = 'RateLimitError'
  }
}

/**
 * 500 - Internal Server Error
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(message, 'INTERNAL_ERROR', 500, details)
    this.name = 'InternalError'
  }
}

/**
 * 503 - Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', details?: unknown) {
    super(message, 'SERVICE_UNAVAILABLE', 503, details)
    this.name = 'ServiceUnavailableError'
  }
}

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Create error from unknown type
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }

  if (error instanceof Error) {
    return new InternalError(error.message)
  }

  return new InternalError('An unexpected error occurred')
}
