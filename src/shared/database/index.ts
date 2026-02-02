import { PrismaClient } from '@prisma/client'

// ============================================
// Database Client Singleton
// ============================================

let prismaInstance: PrismaClient | null = null

export interface DatabaseConfig {
  /** Database URL (overrides DATABASE_URL env) */
  url?: string
  /** Enable query logging */
  logging?: boolean
}

/**
 * Get or create Prisma client instance
 */
export function getDatabase(config: DatabaseConfig = {}): PrismaClient {
  if (prismaInstance) {
    return prismaInstance
  }

  prismaInstance = new PrismaClient({
    datasources: config.url
      ? { db: { url: config.url } }
      : undefined,
    log: config.logging
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  })

  return prismaInstance
}

/**
 * Create a new Prisma client (for isolated connections)
 */
export function createDatabase(config: DatabaseConfig = {}): PrismaClient {
  return new PrismaClient({
    datasources: config.url
      ? { db: { url: config.url } }
      : undefined,
    log: config.logging
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  })
}

/**
 * Disconnect and reset the singleton
 */
export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect()
    prismaInstance = null
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

// ============================================
// Transaction Helper
// ============================================

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * Execute operations in a transaction
 */
export async function withTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn)
}

// ============================================
// Soft Delete Helpers
// ============================================

/**
 * Add soft delete filter to where clause
 */
export function withSoftDelete<T extends Record<string, unknown>>(
  where: T,
  includeDeleted: boolean = false
): T & { deletedAt?: null | { not: null } } {
  if (includeDeleted) {
    return where
  }
  return { ...where, deletedAt: null }
}

/**
 * Soft delete a record
 */
export async function softDelete<T>(
  prisma: PrismaClient,
  model: string,
  id: string
): Promise<T> {
  // Using $queryRawUnsafe for dynamic model names
  // In practice, you'd use the specific model
  const result = await (prisma as Record<string, unknown>)[model] as {
    update: (args: { where: { id: string }; data: { deletedAt: Date } }) => Promise<T>
  }
  return result.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ============================================
// Query Helpers
// ============================================

export interface QueryOptions {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  includeDeleted?: boolean
}

/**
 * Build Prisma query options from params
 */
export function buildQueryOptions(options: QueryOptions): {
  skip?: number
  take?: number
  orderBy?: Record<string, 'asc' | 'desc'>
} {
  const result: {
    skip?: number
    take?: number
    orderBy?: Record<string, 'asc' | 'desc'>
  } = {}

  if (options.page && options.limit) {
    result.skip = (options.page - 1) * options.limit
    result.take = options.limit
  } else if (options.limit) {
    result.take = options.limit
  }

  if (options.sortBy) {
    result.orderBy = { [options.sortBy]: options.sortOrder || 'desc' }
  }

  return result
}
