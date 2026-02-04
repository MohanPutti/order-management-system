import { Response, NextFunction } from 'express'
import { OrderService } from './service.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { sendSuccess, sendPaginated } from '../../shared/utils/index.js'
import { NotFoundError, ForbiddenError } from '../../shared/errors/index.js'

// ============================================
// Order Controller
// ============================================

export class OrderController {
  constructor(private orderService: OrderService) {}

  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // If not admin, only show own orders
      const params = { ...req.query } as Record<string, unknown>
      if (!req.user?.permissions?.includes('orders.read')) {
        params.userId = req.user?.id
      }

      const { data, total } = await this.orderService.findMany(params)
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
      const order = await this.orderService.findById(req.params.id)
      if (!order) {
        throw new NotFoundError('Order not found')
      }

      // Check ownership
      if (!req.user?.permissions?.includes('orders.read') && order.userId !== req.user?.id) {
        throw new ForbiddenError('Access denied')
      }

      sendSuccess(res, order)
    } catch (error) {
      next(error)
    }
  }

  getByOrderNumber = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.orderService.findByOrderNumber(req.params.orderNumber)
      if (!order) {
        throw new NotFoundError('Order not found')
      }

      // Check ownership or email match
      // For guests, allow access if email query param matches order email
      const emailQuery = req.query.email as string | undefined
      const hasPermission = req.user?.permissions?.includes('orders.read')
      const isOwner = order.userId === req.user?.id
      const emailMatches = order.email === req.user?.email || order.email === emailQuery

      if (!hasPermission && !isOwner && !emailMatches) {
        throw new ForbiddenError('Access denied')
      }

      sendSuccess(res, order)
    } catch (error) {
      next(error)
    }
  }

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Attach user ID if authenticated
      const data = { ...req.body }
      if (req.user?.id && !data.userId) {
        data.userId = req.user.id
      }
      if (req.user?.email && !data.email) {
        data.email = req.user.email
      }

      const order = await this.orderService.create(data)
      sendSuccess(res, order, 201)
    } catch (error) {
      next(error)
    }
  }

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.orderService.update(req.params.id, req.body)
      sendSuccess(res, order)
    } catch (error) {
      next(error)
    }
  }

  confirm = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.orderService.confirm(req.params.id)
      sendSuccess(res, order)
    } catch (error) {
      next(error)
    }
  }

  cancel = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const order = await this.orderService.cancel(req.params.id, req.body.reason)
      sendSuccess(res, order)
    } catch (error) {
      next(error)
    }
  }

  addEvent = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = await this.orderService.addEvent(req.params.id, {
        ...req.body,
        createdBy: req.user?.id,
      })
      sendSuccess(res, event, 201)
    } catch (error) {
      next(error)
    }
  }

  getEvents = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const events = await this.orderService.getEvents(req.params.id)
      sendSuccess(res, events)
    } catch (error) {
      next(error)
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createOrderController(orderService: OrderService): OrderController {
  return new OrderController(orderService)
}
