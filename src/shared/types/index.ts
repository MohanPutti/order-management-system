import { Request, Response, NextFunction, Router } from 'express'
import { Decimal } from '@prisma/client/runtime/library'

// Re-export Decimal for use in modules
export { Decimal }

// Type alias for monetary values (Prisma returns Decimal, but we often want number)
export type MonetaryValue = number | Decimal

// Helper to convert Decimal to number
export function toNumber(value: MonetaryValue): number {
  if (typeof value === 'number') return value
  return value.toNumber()
}

// ============================================
// Core Types - Used across all modules
// ============================================

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Base entity with common fields
 */
export interface BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Soft delete support
 */
export interface SoftDeletable {
  deletedAt: Date | null
  isDeleted: boolean
}

// ============================================
// Module Configuration Types
// ============================================

/**
 * Base module configuration
 */
export interface BaseModuleConfig {
  /** Enable/disable the module */
  enabled?: boolean
  /** Base path for routes (e.g., '/api/users') */
  basePath?: string
  /** Custom middleware to apply */
  middleware?: MiddlewareFunction[]
  /** Event handlers for module events */
  events?: EventHandlers
  /** Hooks for customizing behavior - each module defines its own hooks */
  hooks?: Record<string, unknown>
}

/**
 * JWT configuration
 */
export interface JwtConfig {
  secret: string
  expiresIn: string
  refreshSecret?: string
  refreshExpiresIn?: string
}

// ============================================
// Middleware Types
// ============================================

export type MiddlewareFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>

/**
 * Authenticated request with user context
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    roles?: string[]
    permissions?: string[]
    [key: string]: unknown
  }
  token?: string
}

// ============================================
// Event System Types
// ============================================

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

export interface EventHandlers {
  [eventName: string]: EventHandler | EventHandler[]
}

// ============================================
// Hook Types - For customizing module behavior
// ============================================

/** Generic CRUD hooks that modules can implement */
export interface CrudHooks<T = unknown, CreateInput = unknown, UpdateInput = unknown> {
  beforeCreate?: (data: CreateInput) => CreateInput | Promise<CreateInput>
  afterCreate?: (record: T) => void | Promise<void>
  beforeUpdate?: (id: string, data: UpdateInput) => UpdateInput | Promise<UpdateInput>
  afterUpdate?: (record: T) => void | Promise<void>
  beforeDelete?: (id: string) => void | Promise<void>
  afterDelete?: (id: string) => void | Promise<void>
  /** Index signature for additional hooks */
  [key: string]: unknown
}

/** Base module hooks - modules extend this with their specific hooks */
export interface ModuleHooks extends Partial<CrudHooks> {
  [key: string]: unknown
}

// ============================================
// Service Types
// ============================================

/**
 * Base service interface
 */
export interface BaseService<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>
  findMany(params?: PaginationParams & Record<string, unknown>): Promise<{ data: T[]; total: number }>
  create(data: CreateInput): Promise<T>
  update(id: string, data: UpdateInput): Promise<T>
  delete(id: string): Promise<void>
}

// ============================================
// Router Factory Types
// ============================================

export interface RouterFactory<TConfig extends BaseModuleConfig = BaseModuleConfig> {
  (config: TConfig): Router
}

// ============================================
// Adapter Types - For external integrations
// ============================================

export interface BaseAdapter {
  name: string
  initialize?(): Promise<void>
  healthCheck?(): Promise<boolean>
}

// ============================================
// Filter & Query Types
// ============================================

export interface FilterOperators<T> {
  equals?: T
  not?: T
  in?: T[]
  notIn?: T[]
  lt?: T
  lte?: T
  gt?: T
  gte?: T
  contains?: string
  startsWith?: string
  endsWith?: string
}

export type WhereClause<T> = {
  [K in keyof T]?: T[K] | FilterOperators<T[K]>
} & {
  AND?: WhereClause<T>[]
  OR?: WhereClause<T>[]
  NOT?: WhereClause<T>
}
