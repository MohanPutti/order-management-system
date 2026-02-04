// ============================================
// Order Management Module - Public API
// ============================================

export * from './types.js'
export * from './validators.js'
export { OrderService, createOrderService } from './service.js'
export { OrderController, createOrderController } from './controller.js'
export { createOrderRouter, CreateOrderRouterOptions } from './routes.js'

// ============================================
// Quick Setup Helper
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router } from 'express'
import { createOrderRouter } from './routes.js'
import { OrderModuleConfig } from './types.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'

export function setupOrderModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  defaultCurrency?: string
  orderNumber?: OrderModuleConfig['orderNumber']
  autoTransitions?: OrderModuleConfig['autoTransitions']
  features?: OrderModuleConfig['features']
  hooks?: OrderModuleConfig['hooks']
}): Router {
  const config: OrderModuleConfig = {
    defaultCurrency: options.defaultCurrency || 'USD',
    orderNumber: {
      prefix: 'ORD',
      length: 8,
      ...options.orderNumber,
    },
    autoTransitions: {
      confirmOnPayment: true,
      completeOnFulfillment: true,
      ...options.autoTransitions,
    },
    features: {
      allowEdit: true,
      allowCancel: true,
      trackEvents: true,
      ...options.features,
    },
    hooks: options.hooks,
  }

  return createOrderRouter({
    prisma: options.prisma,
    config,
    verifyToken: options.verifyToken,
  })
}
