import { z } from 'zod'

// ============================================
// User Validators
// ============================================

export const emailSchema = z.string().email('Invalid email address')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')

/**
 * Create password schema with custom rules
 */
export function createPasswordSchema(options: {
  minLength?: number
  requireUppercase?: boolean
  requireLowercase?: boolean
  requireNumbers?: boolean
  requireSpecialChars?: boolean
} = {}): z.ZodType<string> {
  const {
    minLength = 8,
    requireUppercase = false,
    requireLowercase = false,
    requireNumbers = false,
    requireSpecialChars = false,
  } = options

  let schema: z.ZodType<string> = z.string().min(minLength, `Password must be at least ${minLength} characters`)

  if (requireUppercase) {
    schema = schema.refine(
      (val: string) => /[A-Z]/.test(val),
      'Password must contain at least one uppercase letter'
    )
  }

  if (requireLowercase) {
    schema = schema.refine(
      (val: string) => /[a-z]/.test(val),
      'Password must contain at least one lowercase letter'
    )
  }

  if (requireNumbers) {
    schema = schema.refine(
      (val: string) => /[0-9]/.test(val),
      'Password must contain at least one number'
    )
  }

  if (requireSpecialChars) {
    schema = schema.refine(
      (val: string) => /[!@#$%^&*(),.?":{}|<>]/.test(val),
      'Password must contain at least one special character'
    )
  }

  return schema
}

// ============================================
// Request Validators
// ============================================

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  avatar: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  roles: z.array(z.string().uuid()).optional(),
})

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  avatar: z.string().url().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
})

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

// ============================================
// Role Validators
// ============================================

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().uuid()).optional(),
})

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().uuid()).optional(),
})

// ============================================
// API Key Validators
// ============================================

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  expiresAt: z.string().datetime().optional(),
})

// ============================================
// Query Validators
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const userQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  roleId: z.string().uuid().optional(),
  includeDeleted: z.coerce.boolean().optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
})

// ============================================
// Zod Inferred Types (for internal validation use)
// Note: Canonical types are in types.ts
// ============================================

export type UserQueryInput = z.infer<typeof userQuerySchema>
