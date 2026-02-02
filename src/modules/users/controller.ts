import { Response, NextFunction } from 'express'
import { UserService } from './service.js'
import { AuthenticatedRequest } from '../../shared/types/index.js'
import { sendSuccess, sendPaginated } from '../../shared/utils/index.js'
import { BadRequestError } from '../../shared/errors/index.js'

// ============================================
// User Controller
// ============================================

export class UserController {
  constructor(private userService: UserService) {}

  // ==========================================
  // Authentication
  // ==========================================

  register = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.userService.register(req.body)
      sendSuccess(res, result, 201)
    } catch (error) {
      next(error)
    }
  }

  login = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.userService.login(req.body)
      sendSuccess(res, result)
    } catch (error) {
      next(error)
    }
  }

  logout = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      await this.userService.logout(req.user.id, req.token)
      sendSuccess(res, { message: 'Logged out successfully' })
    } catch (error) {
      next(error)
    }
  }

  refreshTokens = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { refreshToken } = req.body
      const tokens = await this.userService.refreshTokens(refreshToken)
      sendSuccess(res, tokens)
    } catch (error) {
      next(error)
    }
  }

  changePassword = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      await this.userService.changePassword(req.user.id, req.body)
      sendSuccess(res, { message: 'Password changed successfully' })
    } catch (error) {
      next(error)
    }
  }

  requestPasswordReset = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.userService.requestPasswordReset(req.body.email)
      // Always return success to prevent email enumeration
      sendSuccess(res, { message: 'If the email exists, a reset link has been sent' })
    } catch (error) {
      next(error)
    }
  }

  resetPassword = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.userService.resetPassword(req.body)
      sendSuccess(res, { message: 'Password reset successfully' })
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Current User
  // ==========================================

  getMe = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      const user = await this.userService.findByIdWithRoles(req.user.id)
      sendSuccess(res, user)
    } catch (error) {
      next(error)
    }
  }

  updateMe = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      const user = await this.userService.update(req.user.id, req.body)
      sendSuccess(res, user)
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // User CRUD (Admin)
  // ==========================================

  list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { data, total } = await this.userService.findMany(req.query as Record<string, unknown>)
      sendPaginated(res, data, total, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
      })
    } catch (error) {
      next(error)
    }
  }

  getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.findByIdWithRoles(req.params.id)
      if (!user) {
        throw new BadRequestError('User not found')
      }
      sendSuccess(res, user)
    } catch (error) {
      next(error)
    }
  }

  create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.create(req.body)
      sendSuccess(res, user, 201)
    } catch (error) {
      next(error)
    }
  }

  update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.update(req.params.id, req.body)
      sendSuccess(res, user)
    } catch (error) {
      next(error)
    }
  }

  delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.userService.delete(req.params.id)
      sendSuccess(res, { message: 'User deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Role Management
  // ==========================================

  assignRole = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.userService.assignRole(req.params.id, req.body.roleId)
      sendSuccess(res, { message: 'Role assigned successfully' })
    } catch (error) {
      next(error)
    }
  }

  removeRole = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.userService.removeRole(req.params.id, req.params.roleId)
      sendSuccess(res, { message: 'Role removed successfully' })
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Roles CRUD
  // ==========================================

  listRoles = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const roles = await this.userService.getRoles()
      sendSuccess(res, roles)
    } catch (error) {
      next(error)
    }
  }

  getRoleById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const role = await this.userService.getRoleById(req.params.id)
      if (!role) {
        throw new BadRequestError('Role not found')
      }
      sendSuccess(res, role)
    } catch (error) {
      next(error)
    }
  }

  createRole = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const role = await this.userService.createRole(req.body)
      sendSuccess(res, role, 201)
    } catch (error) {
      next(error)
    }
  }

  updateRole = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const role = await this.userService.updateRole(req.params.id, req.body)
      sendSuccess(res, role)
    } catch (error) {
      next(error)
    }
  }

  deleteRole = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.userService.deleteRole(req.params.id)
      sendSuccess(res, { message: 'Role deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // Permissions
  // ==========================================

  listPermissions = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const permissions = await this.userService.getPermissions()
      sendSuccess(res, permissions)
    } catch (error) {
      next(error)
    }
  }

  // ==========================================
  // API Keys
  // ==========================================

  listApiKeys = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      const keys = await this.userService.getApiKeys(req.user.id)
      // Don't return secrets
      sendSuccess(res, keys.map(({ ...k }) => k))
    } catch (error) {
      next(error)
    }
  }

  createApiKey = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      const result = await this.userService.createApiKey(req.user.id, req.body)
      sendSuccess(res, result, 201)
    } catch (error) {
      next(error)
    }
  }

  revokeApiKey = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new BadRequestError('Not authenticated')
      }
      await this.userService.revokeApiKey(req.user.id, req.params.keyId)
      sendSuccess(res, { message: 'API key revoked successfully' })
    } catch (error) {
      next(error)
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createUserController(userService: UserService): UserController {
  return new UserController(userService)
}
