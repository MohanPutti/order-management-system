import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import {
  User,
  UserWithPermissions,
  AuthTokens,
  LoginResponse,
  CreateUserInput,
  UpdateUserInput,
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput,
  CreateRoleInput,
  UpdateRoleInput,
  CreateApiKeyInput,
  ApiKeyResponse,
  UserModuleConfig,
  UserQueryParams,
  Role,
  Permission,
  ApiKey,
} from './types.js'
import {
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from '../../shared/errors/index.js'
import { getEventBus } from '../../shared/events/index.js'
import { parseDuration, generateRandomString } from '../../shared/utils/index.js'

// ============================================
// User Service
// ============================================

export class UserService {
  private prisma: PrismaClient
  private config: UserModuleConfig
  private eventBus = getEventBus()

  constructor(prisma: PrismaClient, config: UserModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  // ==========================================
  // User CRUD
  // ==========================================

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    })
    return user as User | null
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })
    return user as User | null
  }

  async findByIdWithRoles(id: string): Promise<UserWithPermissions | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!user) return null

    // Flatten permissions
    const permissions = new Set<string>()
    user.roles.forEach((ur) => {
      ur.role.permissions.forEach((rp) => {
        permissions.add(rp.permission.name)
      })
    })

    return {
      ...user,
      permissions: Array.from(permissions),
    } as UserWithPermissions
  }

  async findMany(params: UserQueryParams): Promise<{ data: User[]; total: number }> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      isActive,
      roleId,
      includeDeleted = false,
    } = params

    const where: Record<string, unknown> = {}

    if (!includeDeleted && this.config.features?.softDelete !== false) {
      where.deletedAt = null
    }

    if (isActive !== undefined) {
      where.isActive = isActive
    }

    if (search) {
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ]
    }

    if (roleId) {
      where.roles = { some: { roleId } }
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.user.count({ where }),
    ])

    return { data: data as User[], total }
  }

  async create(data: CreateUserInput): Promise<User> {
    // Check if email exists
    const existing = await this.findByEmail(data.email)
    if (existing) {
      throw new ConflictError('Email already registered')
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12)

    // Run beforeCreate hook
    let userData = { ...data, password: hashedPassword }
    if (this.config.hooks?.beforeCreate) {
      userData = await this.config.hooks.beforeCreate(userData)
    }

    const user = await this.prisma.user.create({
      data: {
        email: userData.email.toLowerCase(),
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        avatar: userData.avatar,
        metadata: userData.metadata as object | undefined,
        roles: userData.roles
          ? {
              create: userData.roles.map((roleId) => ({ roleId })),
            }
          : undefined,
      },
    })

    // Emit event
    this.eventBus.emit('user.created', { userId: user.id, email: user.email })

    // Run afterCreate hook
    if (this.config.hooks?.afterCreate) {
      await this.config.hooks.afterCreate(user as User)
    }

    return user as User
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new NotFoundError('User not found')
    }

    // Check email uniqueness if changing
    if (data.email && data.email !== existing.email) {
      const emailExists = await this.findByEmail(data.email)
      if (emailExists) {
        throw new ConflictError('Email already in use')
      }
    }

    // Run beforeUpdate hook
    let updateData = { ...data }
    if (this.config.hooks?.beforeUpdate) {
      updateData = await this.config.hooks.beforeUpdate(id, updateData)
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        email: updateData.email?.toLowerCase(),
        metadata: updateData.metadata as object | undefined,
      },
    })

    // Emit event
    this.eventBus.emit('user.updated', { userId: user.id, changes: data })

    // Run afterUpdate hook
    if (this.config.hooks?.afterUpdate) {
      await this.config.hooks.afterUpdate(user as User)
    }

    return user as User
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new NotFoundError('User not found')
    }

    // Run beforeDelete hook
    if (this.config.hooks?.beforeDelete) {
      await this.config.hooks.beforeDelete(id)
    }

    if (this.config.features?.softDelete !== false) {
      // Soft delete
      await this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
    } else {
      // Hard delete
      await this.prisma.user.delete({ where: { id } })
    }

    // Emit event
    this.eventBus.emit('user.deleted', { userId: id })

    // Run afterDelete hook
    if (this.config.hooks?.afterDelete) {
      await this.config.hooks.afterDelete(id)
    }
  }

  // ==========================================
  // Authentication
  // ==========================================

  async register(data: RegisterInput): Promise<LoginResponse> {
    if (this.config.features?.registration === false) {
      throw new BadRequestError('Registration is disabled')
    }

    // Run beforeRegister hook
    let registerData = { ...data }
    if (this.config.hooks?.beforeRegister) {
      registerData = await this.config.hooks.beforeRegister(registerData)
    }

    const user = await this.create({
      email: registerData.email,
      password: registerData.password,
      firstName: registerData.firstName,
      lastName: registerData.lastName,
    })

    const tokens = await this.generateTokens(user)

    // Run afterRegister hook
    if (this.config.hooks?.afterRegister) {
      await this.config.hooks.afterRegister(user)
    }

    return {
      user: this.sanitizeUser(user),
      tokens,
    }
  }

  async login(data: LoginInput): Promise<LoginResponse> {
    // Run beforeLogin hook
    if (this.config.hooks?.beforeLogin) {
      await this.config.hooks.beforeLogin(data.email)
    }

    const user = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (!user) {
      if (this.config.hooks?.onLoginFailed) {
        await this.config.hooks.onLoginFailed(data.email, 'User not found')
      }
      throw new UnauthorizedError('Invalid email or password')
    }

    if (!user.isActive) {
      if (this.config.hooks?.onLoginFailed) {
        await this.config.hooks.onLoginFailed(data.email, 'Account inactive')
      }
      throw new UnauthorizedError('Account is inactive')
    }

    if (user.deletedAt) {
      if (this.config.hooks?.onLoginFailed) {
        await this.config.hooks.onLoginFailed(data.email, 'Account deleted')
      }
      throw new UnauthorizedError('Account has been deleted')
    }

    const validPassword = await bcrypt.compare(data.password, user.password)
    if (!validPassword) {
      if (this.config.hooks?.onLoginFailed) {
        await this.config.hooks.onLoginFailed(data.email, 'Invalid password')
      }
      throw new UnauthorizedError('Invalid email or password')
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const tokens = await this.generateTokens(user as User)

    // Emit event
    this.eventBus.emit('user.login', { userId: user.id, timestamp: new Date() })

    // Run afterLogin hook
    if (this.config.hooks?.afterLogin) {
      await this.config.hooks.afterLogin(user as User, tokens)
    }

    return {
      user: this.sanitizeUser(user as User),
      tokens,
    }
  }

  async logout(userId: string, token?: string): Promise<void> {
    if (token) {
      // Invalidate specific session
      await this.prisma.session.deleteMany({
        where: { userId, token },
      })
    } else {
      // Invalidate all sessions
      await this.prisma.session.deleteMany({
        where: { userId },
      })
    }

    // Emit event
    this.eventBus.emit('user.logout', { userId, timestamp: new Date() })
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    // Verify refresh token
    let payload: { userId: string; type: string }
    try {
      payload = jwt.verify(
        refreshToken,
        this.config.jwt.refreshSecret || this.config.jwt.secret
      ) as { userId: string; type: string }
    } catch {
      throw new UnauthorizedError('Invalid refresh token')
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type')
    }

    // Check session exists
    const session = await this.prisma.session.findFirst({
      where: { userId: payload.userId, refreshToken },
    })

    if (!session) {
      throw new UnauthorizedError('Session not found')
    }

    // Get user
    const user = await this.findById(payload.userId)
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive')
    }

    // Generate new tokens
    return this.generateTokens(user, session.id)
  }

  async changePassword(userId: string, data: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundError('User not found')
    }

    const validPassword = await bcrypt.compare(data.currentPassword, user.password)
    if (!validPassword) {
      throw new UnauthorizedError('Current password is incorrect')
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 12)

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    // Invalidate all sessions
    await this.prisma.session.deleteMany({
      where: { userId },
    })

    // Emit event
    this.eventBus.emit('user.passwordChanged', { userId })

    // Run afterPasswordChange hook
    if (this.config.hooks?.afterPasswordChange) {
      await this.config.hooks.afterPasswordChange(userId)
    }
  }

  async requestPasswordReset(email: string): Promise<string> {
    if (this.config.features?.passwordReset === false) {
      throw new BadRequestError('Password reset is disabled')
    }

    const user = await this.findByEmail(email)
    if (!user) {
      // Return silently to prevent email enumeration
      return ''
    }

    // Generate reset token
    const token = generateRandomString(64)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Invalidate existing reset tokens
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    // Create new reset token
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    })

    // Emit event
    this.eventBus.emit('user.passwordResetRequested', { userId: user.id, email: user.email })

    // Run hook (typically sends email)
    if (this.config.hooks?.onPasswordResetRequest) {
      await this.config.hooks.onPasswordResetRequest(user, token)
    }

    return token
  }

  async resetPassword(data: ResetPasswordInput): Promise<void> {
    const resetRecord = await this.prisma.passwordReset.findFirst({
      where: {
        token: data.token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    })

    if (!resetRecord) {
      throw new BadRequestError('Invalid or expired reset token')
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all sessions
      this.prisma.session.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ])

    // Emit event
    this.eventBus.emit('user.passwordChanged', { userId: resetRecord.userId })
  }

  // ==========================================
  // Token Verification
  // ==========================================

  async verifyAccessToken(token: string): Promise<UserWithPermissions | null> {
    try {
      const payload = jwt.verify(token, this.config.jwt.secret) as {
        userId: string
        type: string
      }

      if (payload.type !== 'access') {
        return null
      }

      return this.findByIdWithRoles(payload.userId)
    } catch {
      return null
    }
  }

  async verifyApiKey(key: string, secret: string): Promise<UserWithPermissions | null> {
    if (this.config.features?.apiKeys === false) {
      return null
    }

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { key },
    })

    if (!apiKey || !apiKey.isActive) {
      return null
    }

    // Check expiry
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null
    }

    // Verify secret
    const validSecret = await bcrypt.compare(secret, apiKey.secret)
    if (!validSecret) {
      return null
    }

    // Update last used
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })

    const user = await this.findByIdWithRoles(apiKey.userId)
    if (!user) return null

    // Override permissions with API key scopes
    return {
      ...user,
      permissions: apiKey.scopes as string[],
    }
  }

  // ==========================================
  // Role Management
  // ==========================================

  async getRoles(): Promise<Role[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    })
    return roles as Role[]
  }

  async getRoleById(id: string): Promise<Role | null> {
    const role = await this.prisma.role.findUnique({
      where: { id },
    })
    return role as Role | null
  }

  async createRole(data: CreateRoleInput): Promise<Role> {
    const existing = await this.prisma.role.findUnique({
      where: { name: data.name },
    })

    if (existing) {
      throw new ConflictError('Role name already exists')
    }

    const role = await this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions
          ? {
              create: data.permissions.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
    })

    this.eventBus.emit('role.created', { roleId: role.id, name: role.name })

    return role as Role
  }

  async updateRole(id: string, data: UpdateRoleInput): Promise<Role> {
    const existing = await this.getRoleById(id)
    if (!existing) {
      throw new NotFoundError('Role not found')
    }

    if (existing.isSystem) {
      throw new BadRequestError('Cannot modify system role')
    }

    // Check name uniqueness
    if (data.name && data.name !== existing.name) {
      const nameExists = await this.prisma.role.findUnique({
        where: { name: data.name },
      })
      if (nameExists) {
        throw new ConflictError('Role name already exists')
      }
    }

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions
          ? {
              deleteMany: {},
              create: data.permissions.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
    })

    this.eventBus.emit('role.updated', { roleId: role.id, changes: data })

    return role as Role
  }

  async deleteRole(id: string): Promise<void> {
    const existing = await this.getRoleById(id)
    if (!existing) {
      throw new NotFoundError('Role not found')
    }

    if (existing.isSystem) {
      throw new BadRequestError('Cannot delete system role')
    }

    await this.prisma.role.delete({ where: { id } })

    this.eventBus.emit('role.deleted', { roleId: id })
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    const user = await this.findById(userId)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    const role = await this.getRoleById(roleId)
    if (!role) {
      throw new NotFoundError('Role not found')
    }

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    })
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({
      where: { userId, roleId },
    })
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.findByIdWithRoles(userId)
    return user?.permissions || []
  }

  // ==========================================
  // Permission Management
  // ==========================================

  async getPermissions(): Promise<Permission[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    })
    return permissions as Permission[]
  }

  async getPermissionsByModule(module: string): Promise<Permission[]> {
    const permissions = await this.prisma.permission.findMany({
      where: { module },
      orderBy: { action: 'asc' },
    })
    return permissions as Permission[]
  }

  // ==========================================
  // API Key Management
  // ==========================================

  async createApiKey(userId: string, data: CreateApiKeyInput): Promise<ApiKeyResponse> {
    if (this.config.features?.apiKeys === false) {
      throw new BadRequestError('API keys are disabled')
    }

    const user = await this.findById(userId)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    const key = `ck_${generateRandomString(32)}`
    const secret = generateRandomString(48)
    const hashedSecret = await bcrypt.hash(secret, 12)

    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        name: data.name,
        key,
        secret: hashedSecret,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
      },
    })

    return {
      apiKey: {
        id: apiKey.id,
        userId: apiKey.userId,
        name: apiKey.name,
        key: apiKey.key,
        scopes: apiKey.scopes as string[],
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
      },
      secret, // Only returned on creation
    }
  }

  async getApiKeys(userId: string): Promise<ApiKey[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return keys.map((k) => ({
      ...k,
      scopes: k.scopes as string[],
    })) as ApiKey[]
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    })

    if (!apiKey) {
      throw new NotFoundError('API key not found')
    }

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    })
  }

  // ==========================================
  // OAuth Login
  // ==========================================

  /**
   * Login or register via OAuth provider
   * Called after OAuth provider callback
   */
  async loginWithOAuth(userId: string): Promise<LoginResponse> {
    const user = await this.findById(userId)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive')
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    const tokens = await this.generateTokens(user)

    // Emit event
    this.eventBus.emit('user.login', { userId: user.id, timestamp: new Date() })

    return {
      user: this.sanitizeUser(user),
      tokens,
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async generateTokens(user: User, sessionId?: string): Promise<AuthTokens> {
    const expiresIn = this.config.jwt.expiresIn || '1h'
    const refreshExpiresIn = this.config.jwt.refreshExpiresIn || '7d'

    const accessOptions: SignOptions = { expiresIn: expiresIn as string }
    const refreshOptions: SignOptions = { expiresIn: refreshExpiresIn as string }

    const accessToken = jwt.sign(
      { userId: user.id, type: 'access' },
      this.config.jwt.secret,
      accessOptions
    )

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      this.config.jwt.refreshSecret || this.config.jwt.secret,
      refreshOptions
    )

    // Calculate expiry
    const expiresInMs = parseDuration(expiresIn.replace(/(\d+)([a-z]+)/i, '$1$2'))
    const refreshExpiresInMs = parseDuration(refreshExpiresIn.replace(/(\d+)([a-z]+)/i, '$1$2'))

    // Store session
    if (sessionId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          token: accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + refreshExpiresInMs),
        },
      })
    } else {
      // Check max sessions
      const maxSessions = this.config.session?.maxSessions || 0
      if (maxSessions > 0) {
        const sessionCount = await this.prisma.session.count({
          where: { userId: user.id },
        })
        if (sessionCount >= maxSessions) {
          // Delete oldest session
          const oldestSession = await this.prisma.session.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
          })
          if (oldestSession) {
            await this.prisma.session.delete({ where: { id: oldestSession.id } })
          }
        }
      }

      await this.prisma.session.create({
        data: {
          userId: user.id,
          token: accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + refreshExpiresInMs),
        },
      })
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInMs / 1000, // Return in seconds
    }
  }

  private sanitizeUser(user: User): Omit<User, 'deletedAt'> {
    const { deletedAt: _, ...sanitized } = user
    return sanitized
  }
}

// ============================================
// Factory Function
// ============================================

export function createUserService(
  prisma: PrismaClient,
  config: UserModuleConfig
): UserService {
  return new UserService(prisma, config)
}
