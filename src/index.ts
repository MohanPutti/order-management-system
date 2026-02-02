// ============================================
// Core Modules - Main Entry Point
// ============================================

// Shared utilities
export * from './shared/index.js'

// User Management
export * as users from './modules/users/index.js'
export { setupUserModule, createUserRouter, createUserService, UserService } from './modules/users/index.js'

// Product Management
export * as products from './modules/products/index.js'
export { setupProductModule, createProductRouter, createProductService, ProductService } from './modules/products/index.js'

// Order Management
export * as orders from './modules/orders/index.js'
export { setupOrderModule, createOrderRouter, createOrderService, OrderService } from './modules/orders/index.js'

// Payment Management
export * as payments from './modules/payments/index.js'
export { setupPaymentModule, createPaymentRouter, createPaymentService, PaymentService } from './modules/payments/index.js'

// Cart Management
export * as cart from './modules/cart/index.js'
export { setupCartModule, createCartRouter, createCartService, CartService } from './modules/cart/index.js'

// Fulfillment Management
export * as fulfillment from './modules/fulfillment/index.js'
export { setupFulfillmentModule, createFulfillmentRouter, createFulfillmentService, FulfillmentService } from './modules/fulfillment/index.js'

// Discount Management
export * as discounts from './modules/discounts/index.js'
export { setupDiscountModule, createDiscountRouter, createDiscountService, DiscountService } from './modules/discounts/index.js'

// Notification Management
export * as notifications from './modules/notifications/index.js'
export { setupNotificationModule, createNotificationRouter, createNotificationService, NotificationService } from './modules/notifications/index.js'

// Region Management
export * as regions from './modules/regions/index.js'
export { setupRegionModule, createRegionRouter, createRegionService, RegionService } from './modules/regions/index.js'

// ============================================
// Quick Start Helper
// ============================================

import { PrismaClient } from '@prisma/client'
import express, { Express } from 'express'
import { setupUserModule } from './modules/users/index.js'
import { setupProductModule } from './modules/products/index.js'
import { setupOrderModule } from './modules/orders/index.js'
import { setupPaymentModule } from './modules/payments/index.js'
import { setupCartModule } from './modules/cart/index.js'
import { setupFulfillmentModule } from './modules/fulfillment/index.js'
import { setupDiscountModule } from './modules/discounts/index.js'
import { setupNotificationModule } from './modules/notifications/index.js'
import { setupRegionModule } from './modules/regions/index.js'
import { AuthenticatedRequest } from './shared/types/index.js'

export interface CoreModulesConfig {
  prisma: PrismaClient
  jwtSecret: string
  /** Modules to enable (default: all) */
  modules?: {
    users?: boolean
    products?: boolean
    orders?: boolean
    payments?: boolean
    cart?: boolean
    fulfillment?: boolean
    discounts?: boolean
    notifications?: boolean
    regions?: boolean
  }
  /** Base path for all routes (default: '/api') */
  basePath?: string
}

/**
 * Set up all core modules on an Express app
 *
 * @example
 * ```typescript
 * import express from 'express'
 * import { PrismaClient } from '@prisma/client'
 * import { setupCoreModules } from '@core/modules'
 *
 * const app = express()
 * const prisma = new PrismaClient()
 *
 * setupCoreModules(app, {
 *   prisma,
 *   jwtSecret: process.env.JWT_SECRET!,
 * })
 *
 * app.listen(3000)
 * ```
 */
export function setupCoreModules(app: Express, config: CoreModulesConfig): void {
  const {
    prisma,
    jwtSecret,
    modules = {},
    basePath = '/api',
  } = config

  // Default all modules to enabled
  const enabledModules = {
    users: true,
    products: true,
    orders: true,
    payments: true,
    cart: true,
    fulfillment: true,
    discounts: true,
    notifications: true,
    regions: true,
    ...modules,
  }

  // Middleware
  app.use(express.json())

  // Create shared token verifier
  let verifyToken: ((token: string) => Promise<AuthenticatedRequest['user']>) | undefined

  // Users module (must be first for auth)
  if (enabledModules.users) {
    const userRouter = setupUserModule({
      prisma,
      jwtSecret,
    })
    app.use(basePath, userRouter)

    // Create verifyToken function for other modules
    const { createUserService } = require('./modules/users/index.js')
    const userService = createUserService(prisma, { jwt: { secret: jwtSecret, expiresIn: '1h' } })

    verifyToken = async (token: string) => {
      const user = await userService.verifyAccessToken(token)
      if (!user) return undefined
      return {
        id: user.id,
        email: user.email,
        roles: user.roles.map((r: { role: { name: string } }) => r.role.name),
        permissions: user.permissions,
      }
    }
  }

  // Products module
  if (enabledModules.products) {
    app.use(basePath, setupProductModule({ prisma, verifyToken }))
  }

  // Cart module
  if (enabledModules.cart) {
    app.use(basePath, setupCartModule({ prisma, verifyToken }))
  }

  // Orders module
  if (enabledModules.orders) {
    app.use(basePath, setupOrderModule({ prisma, verifyToken }))
  }

  // Payments module
  if (enabledModules.payments) {
    app.use(basePath, setupPaymentModule({ prisma, verifyToken }))
  }

  // Fulfillment module
  if (enabledModules.fulfillment) {
    app.use(basePath, setupFulfillmentModule({ prisma, verifyToken }))
  }

  // Discounts module
  if (enabledModules.discounts) {
    app.use(basePath, setupDiscountModule({ prisma, verifyToken }))
  }

  // Notifications module
  if (enabledModules.notifications) {
    app.use(basePath, setupNotificationModule({ prisma, verifyToken }))
  }

  // Regions module
  if (enabledModules.regions) {
    app.use(basePath, setupRegionModule({ prisma, verifyToken }))
  }
}
