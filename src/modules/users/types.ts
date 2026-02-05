import { BaseModuleConfig, JwtConfig, CrudHooks } from '../../shared/types/index.js'

// ============================================
// User Module Types
// ============================================

export interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  avatar: string | null
  isActive: boolean
  isVerified: boolean
  verifiedAt: Date | null
  lastLoginAt: Date | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface UserWithRoles extends User {
  roles: {
    role: Role
  }[]
}

export interface UserWithPermissions extends UserWithRoles {
  permissions: string[]
}

export interface Role {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface Permission {
  id: string
  name: string
  description: string | null
  module: string
  action: string
  createdAt: Date
  updatedAt: Date
}

export interface ApiKey {
  id: string
  userId: string
  name: string
  key: string
  scopes: string[]
  expiresAt: Date | null
  lastUsedAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  id: string
  userId: string
  token: string
  refreshToken: string | null
  userAgent: string | null
  ipAddress: string | null
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

// ============================================
// Input Types
// ============================================

export interface CreateUserInput {
  email: string
  password: string
  firstName?: string
  lastName?: string
  phone?: string
  avatar?: string
  metadata?: Record<string, unknown>
  roles?: string[] // Role IDs
}

export interface UpdateUserInput {
  email?: string
  firstName?: string
  lastName?: string
  phone?: string
  avatar?: string
  isActive?: boolean
  metadata?: Record<string, unknown>
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface ResetPasswordInput {
  token: string
  password: string
}

export interface CreateRoleInput {
  name: string
  description?: string
  permissions?: string[] // Permission IDs
}

export interface UpdateRoleInput {
  name?: string
  description?: string
  permissions?: string[] // Permission IDs
}

export interface CreateApiKeyInput {
  name: string
  scopes: string[]
  expiresAt?: Date
}

// ============================================
// Response Types
// ============================================

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginResponse {
  user: Omit<User, 'deletedAt'>
  tokens: AuthTokens
}

export interface ApiKeyResponse {
  apiKey: Omit<ApiKey, 'key'> & { key?: string }
  secret?: string // Only returned on creation
}

// ============================================
// Module Configuration
// ============================================

export interface UserModuleConfig extends BaseModuleConfig {
  /** JWT configuration */
  jwt: JwtConfig

  /** Frontend URL for OAuth redirects */
  frontendUrl?: string

  /** Password requirements */
  password?: {
    minLength?: number
    requireUppercase?: boolean
    requireLowercase?: boolean
    requireNumbers?: boolean
    requireSpecialChars?: boolean
  }

  /** Session configuration */
  session?: {
    /** Session duration (e.g., '7d', '24h') */
    duration?: string
    /** Enable refresh tokens */
    enableRefreshTokens?: boolean
    /** Max sessions per user (0 = unlimited) */
    maxSessions?: number
  }

  /** Feature flags */
  features?: {
    /** Allow user registration */
    registration?: boolean
    /** Require email verification */
    emailVerification?: boolean
    /** Enable password reset */
    passwordReset?: boolean
    /** Enable API keys */
    apiKeys?: boolean
    /** Enable soft delete */
    softDelete?: boolean
    /** Enable OAuth providers */
    oauth?: boolean
  }

  /** OAuth configuration */
  oauth?: {
    google?: {
      clientId: string
      clientSecret: string
      redirectUri: string
      scopes?: string[]
    }
    // Future providers
    // facebook?: { ... }
    // apple?: { ... }
    // github?: { ... }
  }

  /** Module-specific hooks */
  hooks?: UserModuleHooks
}

export interface UserModuleHooks extends CrudHooks<User, CreateUserInput, UpdateUserInput> {
  /** Called before user registration */
  beforeRegister?: (data: RegisterInput) => RegisterInput | Promise<RegisterInput>
  /** Called after user registration */
  afterRegister?: (user: User) => void | Promise<void>
  /** Called before login */
  beforeLogin?: (email: string) => void | Promise<void>
  /** Called after successful login */
  afterLogin?: (user: User, tokens: AuthTokens) => void | Promise<void>
  /** Called after failed login */
  onLoginFailed?: (email: string, reason: string) => void | Promise<void>
  /** Called after password change */
  afterPasswordChange?: (userId: string) => void | Promise<void>
  /** Called when generating password reset token */
  onPasswordResetRequest?: (user: User, token: string) => void | Promise<void>
  /** Called after OAuth login (new or existing user) */
  afterOAuthLogin?: (user: User, provider: string, isNewUser: boolean) => void | Promise<void>
}

// ============================================
// Service Interface
// ============================================

export interface IUserService {
  // User CRUD
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findMany(params: UserQueryParams): Promise<{ data: User[]; total: number }>
  create(data: CreateUserInput): Promise<User>
  update(id: string, data: UpdateUserInput): Promise<User>
  delete(id: string): Promise<void>

  // Authentication
  register(data: RegisterInput): Promise<LoginResponse>
  login(data: LoginInput): Promise<LoginResponse>
  logout(userId: string, token?: string): Promise<void>
  refreshTokens(refreshToken: string): Promise<AuthTokens>
  changePassword(userId: string, data: ChangePasswordInput): Promise<void>
  requestPasswordReset(email: string): Promise<string>
  resetPassword(data: ResetPasswordInput): Promise<void>

  // Token verification
  verifyAccessToken(token: string): Promise<UserWithPermissions | null>
  verifyApiKey(key: string, secret: string): Promise<UserWithPermissions | null>

  // Role management
  assignRole(userId: string, roleId: string): Promise<void>
  removeRole(userId: string, roleId: string): Promise<void>
  getUserPermissions(userId: string): Promise<string[]>
}

export interface UserQueryParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  isActive?: boolean
  roleId?: string
  includeDeleted?: boolean
}
