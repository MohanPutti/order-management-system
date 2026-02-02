import { describe, it, expect } from 'vitest'
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  isAppError,
  normalizeError,
} from './index.js'

describe('AppError', () => {
  it('should create error with all properties', () => {
    const error = new AppError('Test message', 'TEST_CODE', 418, { foo: 'bar' })
    expect(error.message).toBe('Test message')
    expect(error.code).toBe('TEST_CODE')
    expect(error.statusCode).toBe(418)
    expect(error.details).toEqual({ foo: 'bar' })
    expect(error.name).toBe('AppError')
  })

  it('should default statusCode to 500', () => {
    const error = new AppError('Test', 'TEST')
    expect(error.statusCode).toBe(500)
  })

  it('should be instance of Error', () => {
    const error = new AppError('Test', 'TEST')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('BadRequestError', () => {
  it('should have correct defaults', () => {
    const error = new BadRequestError()
    expect(error.message).toBe('Bad request')
    expect(error.code).toBe('BAD_REQUEST')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('BadRequestError')
  })

  it('should accept custom message and details', () => {
    const error = new BadRequestError('Invalid input', { field: 'email' })
    expect(error.message).toBe('Invalid input')
    expect(error.details).toEqual({ field: 'email' })
  })
})

describe('UnauthorizedError', () => {
  it('should have correct defaults', () => {
    const error = new UnauthorizedError()
    expect(error.message).toBe('Unauthorized')
    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.statusCode).toBe(401)
    expect(error.name).toBe('UnauthorizedError')
  })
})

describe('ForbiddenError', () => {
  it('should have correct defaults', () => {
    const error = new ForbiddenError()
    expect(error.message).toBe('Forbidden')
    expect(error.code).toBe('FORBIDDEN')
    expect(error.statusCode).toBe(403)
    expect(error.name).toBe('ForbiddenError')
  })
})

describe('NotFoundError', () => {
  it('should have correct defaults', () => {
    const error = new NotFoundError()
    expect(error.message).toBe('Resource not found')
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('NotFoundError')
  })

  it('should accept custom message', () => {
    const error = new NotFoundError('User not found')
    expect(error.message).toBe('User not found')
  })
})

describe('ConflictError', () => {
  it('should have correct defaults', () => {
    const error = new ConflictError()
    expect(error.message).toBe('Resource already exists')
    expect(error.code).toBe('CONFLICT')
    expect(error.statusCode).toBe(409)
    expect(error.name).toBe('ConflictError')
  })
})

describe('ValidationError', () => {
  it('should have correct defaults', () => {
    const error = new ValidationError()
    expect(error.message).toBe('Validation failed')
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.statusCode).toBe(422)
    expect(error.name).toBe('ValidationError')
  })

  it('should accept validation details', () => {
    const details = [{ field: 'email', message: 'Invalid email' }]
    const error = new ValidationError('Validation failed', details)
    expect(error.details).toEqual(details)
  })
})

describe('RateLimitError', () => {
  it('should have correct defaults', () => {
    const error = new RateLimitError()
    expect(error.message).toBe('Too many requests')
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(error.statusCode).toBe(429)
    expect(error.name).toBe('RateLimitError')
  })
})

describe('InternalError', () => {
  it('should have correct defaults', () => {
    const error = new InternalError()
    expect(error.message).toBe('Internal server error')
    expect(error.code).toBe('INTERNAL_ERROR')
    expect(error.statusCode).toBe(500)
    expect(error.name).toBe('InternalError')
  })
})

describe('ServiceUnavailableError', () => {
  it('should have correct defaults', () => {
    const error = new ServiceUnavailableError()
    expect(error.message).toBe('Service unavailable')
    expect(error.code).toBe('SERVICE_UNAVAILABLE')
    expect(error.statusCode).toBe(503)
    expect(error.name).toBe('ServiceUnavailableError')
  })
})

describe('isAppError', () => {
  it('should return true for AppError', () => {
    expect(isAppError(new AppError('Test', 'TEST'))).toBe(true)
  })

  it('should return true for subclasses', () => {
    expect(isAppError(new BadRequestError())).toBe(true)
    expect(isAppError(new NotFoundError())).toBe(true)
    expect(isAppError(new InternalError())).toBe(true)
  })

  it('should return false for regular Error', () => {
    expect(isAppError(new Error('Test'))).toBe(false)
  })

  it('should return false for non-errors', () => {
    expect(isAppError('string')).toBe(false)
    expect(isAppError(null)).toBe(false)
    expect(isAppError(undefined)).toBe(false)
    expect(isAppError({})).toBe(false)
  })
})

describe('normalizeError', () => {
  it('should return AppError unchanged', () => {
    const original = new NotFoundError('Test')
    const result = normalizeError(original)
    expect(result).toBe(original)
  })

  it('should wrap regular Error in InternalError', () => {
    const original = new Error('Something went wrong')
    const result = normalizeError(original)
    expect(result).toBeInstanceOf(InternalError)
    expect(result.message).toBe('Something went wrong')
  })

  it('should wrap non-Error in InternalError', () => {
    const result = normalizeError('string error')
    expect(result).toBeInstanceOf(InternalError)
    expect(result.message).toBe('An unexpected error occurred')
  })

  it('should handle null', () => {
    const result = normalizeError(null)
    expect(result).toBeInstanceOf(InternalError)
  })
})
