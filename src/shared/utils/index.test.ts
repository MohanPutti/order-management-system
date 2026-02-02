import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateRandomString,
  generateSlug,
  maskEmail,
  removeUndefined,
  pick,
  omit,
  isExpired,
  addTime,
  parseDuration,
  sleep,
  retry,
  parsePaginationParams,
  calculateSkip,
} from './index.js'

describe('String Helpers', () => {
  describe('generateRandomString', () => {
    it('should generate string of default length 32', () => {
      const result = generateRandomString()
      expect(result).toHaveLength(32)
    })

    it('should generate string of specified length', () => {
      const result = generateRandomString(16)
      expect(result).toHaveLength(16)
    })

    it('should only contain alphanumeric characters', () => {
      const result = generateRandomString(100)
      expect(result).toMatch(/^[A-Za-z0-9]+$/)
    })

    it('should generate different strings each time', () => {
      const results = new Set([
        generateRandomString(),
        generateRandomString(),
        generateRandomString(),
      ])
      expect(results.size).toBe(3)
    })
  })

  describe('generateSlug', () => {
    it('should convert text to lowercase', () => {
      expect(generateSlug('Hello World')).toBe('hello-world')
    })

    it('should replace spaces with hyphens', () => {
      expect(generateSlug('hello world test')).toBe('hello-world-test')
    })

    it('should remove special characters', () => {
      expect(generateSlug('Hello! World?')).toBe('hello-world')
    })

    it('should trim whitespace', () => {
      expect(generateSlug('  hello world  ')).toBe('hello-world')
    })

    it('should handle multiple consecutive spaces', () => {
      expect(generateSlug('hello    world')).toBe('hello-world')
    })

    it('should remove leading and trailing hyphens', () => {
      expect(generateSlug('--hello-world--')).toBe('hello-world')
    })

    it('should handle underscores', () => {
      expect(generateSlug('hello_world_test')).toBe('hello-world-test')
    })
  })

  describe('maskEmail', () => {
    it('should mask email with long local part', () => {
      expect(maskEmail('johndoe@example.com')).toBe('j*****e@example.com')
    })

    it('should mask email with short local part', () => {
      expect(maskEmail('ab@example.com')).toBe('**@example.com')
    })

    it('should handle single character local part', () => {
      expect(maskEmail('a@example.com')).toBe('*@example.com')
    })

    it('should return *** for invalid email', () => {
      expect(maskEmail('invalid')).toBe('***')
    })
  })
})

describe('Object Helpers', () => {
  describe('removeUndefined', () => {
    it('should remove undefined values', () => {
      const obj = { a: 1, b: undefined, c: 'test' }
      expect(removeUndefined(obj)).toEqual({ a: 1, c: 'test' })
    })

    it('should keep null values', () => {
      const obj = { a: 1, b: null, c: undefined }
      expect(removeUndefined(obj)).toEqual({ a: 1, b: null })
    })

    it('should return empty object for all undefined', () => {
      const obj = { a: undefined, b: undefined }
      expect(removeUndefined(obj)).toEqual({})
    })
  })

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 }
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
    })

    it('should ignore non-existent keys', () => {
      const obj = { a: 1, b: 2 }
      expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 })
    })

    it('should return empty object for empty keys', () => {
      const obj = { a: 1, b: 2 }
      expect(pick(obj, [])).toEqual({})
    })
  })

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 }
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
    })

    it('should return same object for empty keys', () => {
      const obj = { a: 1, b: 2 }
      expect(omit(obj, [])).toEqual({ a: 1, b: 2 })
    })

    it('should handle non-existent keys', () => {
      const obj = { a: 1, b: 2 }
      expect(omit(obj, ['c' as keyof typeof obj])).toEqual({ a: 1, b: 2 })
    })
  })
})

describe('Date Helpers', () => {
  describe('isExpired', () => {
    it('should return true for past date', () => {
      const pastDate = new Date(Date.now() - 1000)
      expect(isExpired(pastDate)).toBe(true)
    })

    it('should return false for future date', () => {
      const futureDate = new Date(Date.now() + 10000)
      expect(isExpired(futureDate)).toBe(false)
    })
  })

  describe('addTime', () => {
    it('should add milliseconds to date', () => {
      const date = new Date('2024-01-01T00:00:00Z')
      const result = addTime(date, 60000) // 1 minute
      expect(result.getTime()).toBe(date.getTime() + 60000)
    })

    it('should not modify original date', () => {
      const date = new Date('2024-01-01T00:00:00Z')
      const originalTime = date.getTime()
      addTime(date, 60000)
      expect(date.getTime()).toBe(originalTime)
    })
  })

  describe('parseDuration', () => {
    it('should parse seconds', () => {
      expect(parseDuration('30s')).toBe(30 * 1000)
    })

    it('should parse minutes', () => {
      expect(parseDuration('5m')).toBe(5 * 60 * 1000)
    })

    it('should parse hours', () => {
      expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000)
    })

    it('should parse days', () => {
      expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it('should parse weeks', () => {
      expect(parseDuration('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000)
    })

    it('should throw for invalid format', () => {
      expect(() => parseDuration('invalid')).toThrow('Invalid duration format')
    })

    it('should throw for missing unit', () => {
      expect(() => parseDuration('30')).toThrow('Invalid duration format')
    })
  })
})

describe('Pagination Helpers', () => {
  describe('parsePaginationParams', () => {
    it('should parse page and limit', () => {
      const result = parsePaginationParams({ page: '2', limit: '20' })
      expect(result.page).toBe(2)
      expect(result.limit).toBe(20)
    })

    it('should use defaults for missing values', () => {
      const result = parsePaginationParams({})
      expect(result.page).toBe(1)
      expect(result.limit).toBe(10)
      expect(result.sortOrder).toBe('desc')
    })

    it('should enforce minimum page of 1', () => {
      const result = parsePaginationParams({ page: '0' })
      expect(result.page).toBe(1)
    })

    it('should enforce maximum limit of 100', () => {
      const result = parsePaginationParams({ limit: '200' })
      expect(result.limit).toBe(100)
    })

    it('should enforce minimum limit of 1', () => {
      const result = parsePaginationParams({ limit: '0' })
      expect(result.limit).toBe(1)
    })

    it('should parse sortBy and sortOrder', () => {
      const result = parsePaginationParams({ sortBy: 'name', sortOrder: 'asc' })
      expect(result.sortBy).toBe('name')
      expect(result.sortOrder).toBe('asc')
    })
  })

  describe('calculateSkip', () => {
    it('should calculate skip for first page', () => {
      expect(calculateSkip(1, 10)).toBe(0)
    })

    it('should calculate skip for second page', () => {
      expect(calculateSkip(2, 10)).toBe(10)
    })

    it('should calculate skip for third page with different limit', () => {
      expect(calculateSkip(3, 25)).toBe(50)
    })
  })
})

describe('Async Helpers', () => {
  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should resolve after specified time', async () => {
      const promise = sleep(1000)
      vi.advanceTimersByTime(1000)
      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('retry', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await retry(fn)
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')

      const promise = retry(fn, { delay: 100 })
      await vi.advanceTimersByTimeAsync(100)
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should throw after max attempts', async () => {
      vi.useRealTimers() // Use real timers for this test
      const fn = vi.fn().mockRejectedValue(new Error('always fails'))

      await expect(retry(fn, { maxAttempts: 3, delay: 10 })).rejects.toThrow('always fails')
      expect(fn).toHaveBeenCalledTimes(3)
      vi.useFakeTimers() // Restore fake timers for other tests
    })

    it('should use exponential backoff', async () => {
      vi.useRealTimers() // Use real timers for this test
      let callTimes: number[] = []
      const fn = vi.fn().mockImplementation(() => {
        callTimes.push(Date.now())
        if (callTimes.length < 3) {
          return Promise.reject(new Error('fail'))
        }
        return Promise.resolve('success')
      })

      const result = await retry(fn, { delay: 10, backoff: 2, maxAttempts: 3 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
      vi.useFakeTimers() // Restore fake timers for other tests
    })
  })
})
