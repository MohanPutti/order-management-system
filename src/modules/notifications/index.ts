// ============================================
// Notification Management Module
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { NotFoundError } from '../../shared/errors/index.js'
import { sendSuccess, sendPaginated } from '../../shared/utils/index.js'
import {
  validateBody,
  validateParams,
  validateQuery,
  createAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'

// ============================================
// Types - Re-export from types.ts
// ============================================

export * from './types.js'

// ============================================
// Adapters - Re-export from adapters
// ============================================

export * from './adapters/index.js'

// Import types for internal use
import type {
  Notification,
  NotificationTemplate,
  NotificationType,
  NotificationStatus,
  SendNotificationInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  NotificationModuleConfig,
  EmailAdapter,
  SmsAdapter,
  PushAdapter,
} from './types.js'

// ============================================
// Validators
// ============================================

export const notificationTypeSchema = z.enum(['email', 'sms', 'push'])

export const sendNotificationSchema = z.object({
  type: notificationTypeSchema,
  recipient: z.string().min(1),
  subject: z.string().optional(),
  content: z.string().optional(),
  templateName: z.string().optional(),
  templateData: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.content || data.templateName,
  'Either content or templateName must be provided'
)

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  type: notificationTypeSchema,
  subject: z.string().max(255).optional(),
  content: z.string().min(1),
  variables: z.array(z.string()).optional(),
})

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: notificationTypeSchema.optional(),
  subject: z.string().max(255).nullable().optional(),
  content: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

export const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  type: notificationTypeSchema.optional(),
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  recipient: z.string().optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })

// ============================================
// Service
// ============================================

export class NotificationService {
  private prisma: PrismaClient
  private config: NotificationModuleConfig

  constructor(prisma: PrismaClient, config: NotificationModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  async findById(id: string): Promise<Notification | null> {
    const notification = await this.prisma.notification.findUnique({ where: { id } })
    return notification as Notification | null
  }

  async findMany(params: {
    page?: number
    limit?: number
    type?: NotificationType
    status?: NotificationStatus
    recipient?: string
  }): Promise<{ data: Notification[]; total: number }> {
    const { page = 1, limit = 10, type, status, recipient } = params
    const where: Record<string, unknown> = {}

    if (type) where.type = type
    if (status) where.status = status
    if (recipient) where.recipient = { contains: recipient }

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ])

    return { data: data as Notification[], total }
  }

  async send(input: SendNotificationInput): Promise<Notification> {
    let content = input.content || ''
    let subject = input.subject || ''

    // Process template if provided
    if (input.templateName) {
      const template = await this.prisma.notificationTemplate.findUnique({
        where: { name: input.templateName },
      })
      if (!template || !template.isActive) {
        throw new NotFoundError('Template not found or inactive')
      }

      content = this.processTemplate(template.content, input.templateData || {})
      if (template.subject) {
        subject = this.processTemplate(template.subject, input.templateData || {})
      }
    }

    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        type: input.type,
        recipient: input.recipient,
        subject,
        content,
        status: 'pending',
        metadata: input.metadata as object | undefined,
      },
    })

    // Send notification asynchronously
    this.sendAsync(notification as Notification)

    return notification as Notification
  }

  private async sendAsync(notification: Notification): Promise<void> {
    try {
      const adapter = this.config.adapters?.[notification.type]
      if (!adapter) {
        throw new Error(`No adapter configured for ${notification.type}`)
      }

      if (notification.type === 'email' && 'send' in adapter) {
        await (adapter as EmailAdapter).send(
          notification.recipient,
          notification.subject || '',
          notification.content
        )
      } else if (notification.type === 'sms' && 'send' in adapter) {
        await (adapter as SmsAdapter).send(notification.recipient, notification.content)
      } else if (notification.type === 'push' && 'send' in adapter) {
        await (adapter as PushAdapter).send(
          notification.recipient,
          notification.subject || '',
          notification.content
        )
      }

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'sent', sentAt: new Date() },
      })

      if (this.config.hooks?.onNotificationSent) {
        const updated = await this.findById(notification.id)
        await this.config.hooks.onNotificationSent(updated!)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'failed', failedAt: new Date(), error: errorMessage },
      })

      if (this.config.hooks?.onNotificationFailed) {
        const updated = await this.findById(notification.id)
        await this.config.hooks.onNotificationFailed(updated!, errorMessage)
      }
    }
  }

  async retry(id: string): Promise<Notification> {
    const notification = await this.findById(id)
    if (!notification) throw new NotFoundError('Notification not found')
    if (notification.status !== 'failed') {
      throw new Error('Only failed notifications can be retried')
    }

    await this.prisma.notification.update({
      where: { id },
      data: { status: 'pending', error: null },
    })

    this.sendAsync(notification)

    return (await this.findById(id))!
  }

  // Templates
  async getTemplates(): Promise<NotificationTemplate[]> {
    const templates = await this.prisma.notificationTemplate.findMany({
      orderBy: { name: 'asc' },
    })
    return templates as NotificationTemplate[]
  }

  async getTemplateById(id: string): Promise<NotificationTemplate | null> {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id } })
    return template as NotificationTemplate | null
  }

  async createTemplate(data: CreateTemplateInput): Promise<NotificationTemplate> {
    const template = await this.prisma.notificationTemplate.create({
      data: {
        name: data.name,
        type: data.type,
        subject: data.subject,
        content: data.content,
        variables: data.variables,
      },
    })
    return template as NotificationTemplate
  }

  async updateTemplate(id: string, data: UpdateTemplateInput): Promise<NotificationTemplate> {
    const existing = await this.getTemplateById(id)
    if (!existing) throw new NotFoundError('Template not found')

    const template = await this.prisma.notificationTemplate.update({
      where: { id },
      data,
    })
    return template as NotificationTemplate
  }

  async deleteTemplate(id: string): Promise<void> {
    const existing = await this.getTemplateById(id)
    if (!existing) throw new NotFoundError('Template not found')

    await this.prisma.notificationTemplate.delete({ where: { id } })
  }

  private processTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(data[key] ?? '')
    })
  }
}

export function createNotificationService(prisma: PrismaClient, config: NotificationModuleConfig): NotificationService {
  return new NotificationService(prisma, config)
}

// ============================================
// Controller
// ============================================

export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, total } = await this.notificationService.findMany(req.query as Record<string, unknown>)
      sendPaginated(res, data, total, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
      })
    } catch (error) {
      next(error)
    }
  }

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notification = await this.notificationService.findById(req.params.id)
      if (!notification) throw new NotFoundError('Notification not found')
      sendSuccess(res, notification)
    } catch (error) {
      next(error)
    }
  }

  send = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notification = await this.notificationService.send(req.body)
      sendSuccess(res, notification, 201)
    } catch (error) {
      next(error)
    }
  }

  retry = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notification = await this.notificationService.retry(req.params.id)
      sendSuccess(res, notification)
    } catch (error) {
      next(error)
    }
  }

  // Templates
  listTemplates = async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templates = await this.notificationService.getTemplates()
      sendSuccess(res, templates)
    } catch (error) {
      next(error)
    }
  }

  getTemplateById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const template = await this.notificationService.getTemplateById(req.params.id)
      if (!template) throw new NotFoundError('Template not found')
      sendSuccess(res, template)
    } catch (error) {
      next(error)
    }
  }

  createTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const template = await this.notificationService.createTemplate(req.body)
      sendSuccess(res, template, 201)
    } catch (error) {
      next(error)
    }
  }

  updateTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const template = await this.notificationService.updateTemplate(req.params.id, req.body)
      sendSuccess(res, template)
    } catch (error) {
      next(error)
    }
  }

  deleteTemplate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.notificationService.deleteTemplate(req.params.id)
      sendSuccess(res, { message: 'Template deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
}

export function createNotificationController(service: NotificationService): NotificationController {
  return new NotificationController(service)
}

// ============================================
// Router
// ============================================

export interface CreateNotificationRouterOptions {
  prisma: PrismaClient
  config: NotificationModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createNotificationRouter(options: CreateNotificationRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const service = createNotificationService(prisma, config)
  const controller = createNotificationController(service)

  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  // Notifications
  router.get('/notifications', authenticate, requirePermissions('notifications.read'), validateQuery(querySchema), controller.list)
  router.get('/notifications/:id', authenticate, requirePermissions('notifications.read'), validateParams(idParamSchema), controller.getById)
  router.post('/notifications', authenticate, requirePermissions('notifications.send'), validateBody(sendNotificationSchema), controller.send)
  router.post('/notifications/:id/retry', authenticate, requirePermissions('notifications.send'), validateParams(idParamSchema), controller.retry)

  // Templates
  router.get('/notification-templates', authenticate, requirePermissions('notifications.read'), controller.listTemplates)
  router.get('/notification-templates/:id', authenticate, requirePermissions('notifications.read'), validateParams(idParamSchema), controller.getTemplateById)
  router.post('/notification-templates', authenticate, requirePermissions('notifications.manage'), validateBody(createTemplateSchema), controller.createTemplate)
  router.put('/notification-templates/:id', authenticate, requirePermissions('notifications.manage'), validateParams(idParamSchema), validateBody(updateTemplateSchema), controller.updateTemplate)
  router.delete('/notification-templates/:id', authenticate, requirePermissions('notifications.manage'), validateParams(idParamSchema), controller.deleteTemplate)

  router.use(errorHandler)
  return router
}

// ============================================
// Quick Setup
// ============================================

export function setupNotificationModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  adapters?: NotificationModuleConfig['adapters']
  hooks?: NotificationModuleConfig['hooks']
}): Router {
  return createNotificationRouter({
    prisma: options.prisma,
    config: { adapters: options.adapters, hooks: options.hooks },
    verifyToken: options.verifyToken,
  })
}
