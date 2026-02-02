// ============================================
// Product Management Module - Public API
// ============================================

// Types
export * from './types.js'

// Validators
export * from './validators.js'

// Service
export { ProductService, createProductService } from './service.js'

// Controller
export { ProductController, createProductController } from './controller.js'

// Router
export { createProductRouter, CreateProductRouterOptions } from './routes.js'

// ============================================
// Quick Setup Helper
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router } from 'express'
import { createProductRouter } from './routes.js'
import { ProductModuleConfig } from './types.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'

/**
 * Quick setup for Product module with sensible defaults
 */
export function setupProductModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  features?: ProductModuleConfig['features']
  inventory?: ProductModuleConfig['inventory']
  hooks?: ProductModuleConfig['hooks']
}): Router {
  const config: ProductModuleConfig = {
    features: {
      softDelete: true,
      variantOptions: true,
      categories: true,
      images: true,
      ...options.features,
    },
    inventory: {
      trackInventory: true,
      allowNegative: false,
      lowStockThreshold: 10,
      ...options.inventory,
    },
    hooks: options.hooks,
  }

  return createProductRouter({
    prisma: options.prisma,
    config,
    verifyToken: options.verifyToken,
  })
}
