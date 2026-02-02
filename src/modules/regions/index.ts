// ============================================
// Region Management Module
// ============================================

import { PrismaClient } from '@prisma/client'
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { BaseModuleConfig, AuthenticatedRequest, MonetaryValue, toNumber } from '../../shared/types/index.js'
import { NotFoundError, ConflictError } from '../../shared/errors/index.js'
import { sendSuccess } from '../../shared/utils/index.js'
import {
  validateBody,
  validateParams,
  createAuthMiddleware,
  requirePermissions,
  errorHandler,
} from '../../shared/middleware/index.js'

// ============================================
// Types
// ============================================

export interface Region {
  id: string
  name: string
  code: string
  currency: string
  taxRate: MonetaryValue
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface RegionWithCountries extends Region {
  countries: Country[]
}

export interface Country {
  id: string
  name: string
  code: string
  regionId: string | null
}

export interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  decimals: number
  isActive: boolean
}

export interface CreateRegionInput {
  name: string
  code: string
  currency: string
  taxRate?: number
  isActive?: boolean
  countryCodes?: string[]
  metadata?: Record<string, unknown>
}

export interface UpdateRegionInput {
  name?: string
  code?: string
  currency?: string
  taxRate?: number
  isActive?: boolean
  countryCodes?: string[]
  metadata?: Record<string, unknown>
}

export interface CreateCurrencyInput {
  code: string
  name: string
  symbol: string
  decimals?: number
  isActive?: boolean
}

export interface UpdateCurrencyInput {
  code?: string
  name?: string
  symbol?: string
  decimals?: number
  isActive?: boolean
}

export interface RegionModuleConfig extends BaseModuleConfig {
  /** Default currency code */
  defaultCurrency?: string
  /** Default tax rate */
  defaultTaxRate?: number
}

// ============================================
// Validators
// ============================================

export const createRegionSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(2).max(10).transform((v) => v.toUpperCase()),
  currency: z.string().length(3).transform((v) => v.toUpperCase()),
  taxRate: z.number().min(0).max(1).optional().default(0),
  isActive: z.boolean().optional().default(true),
  countryCodes: z.array(z.string().length(2)).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateRegionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(2).max(10).transform((v) => v.toUpperCase()).optional(),
  currency: z.string().length(3).transform((v) => v.toUpperCase()).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  countryCodes: z.array(z.string().length(2)).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const createCurrencySchema = z.object({
  code: z.string().length(3).transform((v) => v.toUpperCase()),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10),
  decimals: z.number().int().min(0).max(4).optional().default(2),
  isActive: z.boolean().optional().default(true),
})

export const updateCurrencySchema = z.object({
  code: z.string().length(3).transform((v) => v.toUpperCase()).optional(),
  name: z.string().min(1).max(100).optional(),
  symbol: z.string().min(1).max(10).optional(),
  decimals: z.number().int().min(0).max(4).optional(),
  isActive: z.boolean().optional(),
})

export const idParamSchema = z.object({ id: z.string().uuid() })
export const codeParamSchema = z.object({ code: z.string().min(2) })

// ============================================
// Service
// ============================================

export class RegionService {
  private prisma: PrismaClient
  private config: RegionModuleConfig

  constructor(prisma: PrismaClient, config: RegionModuleConfig) {
    this.prisma = prisma
    this.config = config
  }

  // Regions
  async getRegions(activeOnly: boolean = false): Promise<RegionWithCountries[]> {
    const where = activeOnly ? { isActive: true } : {}
    const regions = await this.prisma.region.findMany({
      where,
      include: { countries: true },
      orderBy: { name: 'asc' },
    })
    return regions as RegionWithCountries[]
  }

  async getRegionById(id: string): Promise<RegionWithCountries | null> {
    const region = await this.prisma.region.findUnique({
      where: { id },
      include: { countries: true },
    })
    return region as RegionWithCountries | null
  }

  async getRegionByCode(code: string): Promise<RegionWithCountries | null> {
    const region = await this.prisma.region.findUnique({
      where: { code: code.toUpperCase() },
      include: { countries: true },
    })
    return region as RegionWithCountries | null
  }

  async getRegionByCountry(countryCode: string): Promise<RegionWithCountries | null> {
    const country = await this.prisma.country.findUnique({
      where: { code: countryCode.toUpperCase() },
      include: { region: { include: { countries: true } } },
    })
    return country?.region as RegionWithCountries | null
  }

  async createRegion(data: CreateRegionInput): Promise<RegionWithCountries> {
    const existing = await this.getRegionByCode(data.code)
    if (existing) throw new ConflictError('Region code already exists')

    const region = await this.prisma.region.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        currency: data.currency.toUpperCase(),
        taxRate: data.taxRate ?? this.config.defaultTaxRate ?? 0,
        isActive: data.isActive ?? true,
        metadata: data.metadata as object | undefined,
      },
      include: { countries: true },
    })

    // Assign countries if provided
    if (data.countryCodes?.length) {
      await this.prisma.country.updateMany({
        where: { code: { in: data.countryCodes.map((c) => c.toUpperCase()) } },
        data: { regionId: region.id },
      })
    }

    return (await this.getRegionById(region.id))!
  }

  async updateRegion(id: string, data: UpdateRegionInput): Promise<RegionWithCountries> {
    const existing = await this.getRegionById(id)
    if (!existing) throw new NotFoundError('Region not found')

    if (data.code && data.code !== existing.code) {
      const codeExists = await this.getRegionByCode(data.code)
      if (codeExists) throw new ConflictError('Region code already exists')
    }

    const region = await this.prisma.region.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code?.toUpperCase(),
        currency: data.currency?.toUpperCase(),
        taxRate: data.taxRate,
        isActive: data.isActive,
        metadata: data.metadata as object | undefined,
      },
      include: { countries: true },
    })

    // Update country assignments if provided
    if (data.countryCodes !== undefined) {
      // Remove all countries from this region
      await this.prisma.country.updateMany({
        where: { regionId: id },
        data: { regionId: null },
      })
      // Assign new countries
      if (data.countryCodes.length) {
        await this.prisma.country.updateMany({
          where: { code: { in: data.countryCodes.map((c) => c.toUpperCase()) } },
          data: { regionId: id },
        })
      }
    }

    return (await this.getRegionById(id))!
  }

  async deleteRegion(id: string): Promise<void> {
    const existing = await this.getRegionById(id)
    if (!existing) throw new NotFoundError('Region not found')

    // Unassign countries
    await this.prisma.country.updateMany({
      where: { regionId: id },
      data: { regionId: null },
    })

    await this.prisma.region.delete({ where: { id } })
  }

  // Countries
  async getCountries(): Promise<Country[]> {
    const countries = await this.prisma.country.findMany({
      orderBy: { name: 'asc' },
    })
    return countries as Country[]
  }

  async getCountryByCode(code: string): Promise<Country | null> {
    const country = await this.prisma.country.findUnique({
      where: { code: code.toUpperCase() },
    })
    return country as Country | null
  }

  // Currencies
  async getCurrencies(activeOnly: boolean = false): Promise<Currency[]> {
    const where = activeOnly ? { isActive: true } : {}
    const currencies = await this.prisma.currency.findMany({
      where,
      orderBy: { code: 'asc' },
    })
    return currencies as Currency[]
  }

  async getCurrencyByCode(code: string): Promise<Currency | null> {
    const currency = await this.prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
    })
    return currency as Currency | null
  }

  async createCurrency(data: CreateCurrencyInput): Promise<Currency> {
    const existing = await this.getCurrencyByCode(data.code)
    if (existing) throw new ConflictError('Currency code already exists')

    const currency = await this.prisma.currency.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        symbol: data.symbol,
        decimals: data.decimals ?? 2,
        isActive: data.isActive ?? true,
      },
    })

    return currency as Currency
  }

  async updateCurrency(id: string, data: UpdateCurrencyInput): Promise<Currency> {
    const existing = await this.prisma.currency.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Currency not found')

    if (data.code && data.code !== existing.code) {
      const codeExists = await this.getCurrencyByCode(data.code)
      if (codeExists) throw new ConflictError('Currency code already exists')
    }

    const currency = await this.prisma.currency.update({
      where: { id },
      data: {
        code: data.code?.toUpperCase(),
        name: data.name,
        symbol: data.symbol,
        decimals: data.decimals,
        isActive: data.isActive,
      },
    })

    return currency as Currency
  }

  async deleteCurrency(id: string): Promise<void> {
    const existing = await this.prisma.currency.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Currency not found')

    await this.prisma.currency.delete({ where: { id } })
  }

  // Tax calculation helper
  calculateTax(amount: number, taxRate: number): number {
    return amount * taxRate
  }

  calculatePriceWithTax(amount: number, taxRate: number): number {
    return amount * (1 + taxRate)
  }
}

export function createRegionService(prisma: PrismaClient, config: RegionModuleConfig): RegionService {
  return new RegionService(prisma, config)
}

// ============================================
// Controller
// ============================================

export class RegionController {
  constructor(private regionService: RegionService) {}

  // Regions
  listRegions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeOnly = req.query.activeOnly === 'true'
      const regions = await this.regionService.getRegions(activeOnly)
      sendSuccess(res, regions)
    } catch (error) {
      next(error)
    }
  }

  getRegionById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const region = await this.regionService.getRegionById(req.params.id)
      if (!region) throw new NotFoundError('Region not found')
      sendSuccess(res, region)
    } catch (error) {
      next(error)
    }
  }

  getRegionByCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const region = await this.regionService.getRegionByCode(req.params.code)
      if (!region) throw new NotFoundError('Region not found')
      sendSuccess(res, region)
    } catch (error) {
      next(error)
    }
  }

  getRegionByCountry = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const region = await this.regionService.getRegionByCountry(req.params.code)
      if (!region) throw new NotFoundError('No region found for this country')
      sendSuccess(res, region)
    } catch (error) {
      next(error)
    }
  }

  createRegion = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const region = await this.regionService.createRegion(req.body)
      sendSuccess(res, region, 201)
    } catch (error) {
      next(error)
    }
  }

  updateRegion = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const region = await this.regionService.updateRegion(req.params.id, req.body)
      sendSuccess(res, region)
    } catch (error) {
      next(error)
    }
  }

  deleteRegion = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.regionService.deleteRegion(req.params.id)
      sendSuccess(res, { message: 'Region deleted successfully' })
    } catch (error) {
      next(error)
    }
  }

  // Countries
  listCountries = async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const countries = await this.regionService.getCountries()
      sendSuccess(res, countries)
    } catch (error) {
      next(error)
    }
  }

  // Currencies
  listCurrencies = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeOnly = req.query.activeOnly === 'true'
      const currencies = await this.regionService.getCurrencies(activeOnly)
      sendSuccess(res, currencies)
    } catch (error) {
      next(error)
    }
  }

  createCurrency = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currency = await this.regionService.createCurrency(req.body)
      sendSuccess(res, currency, 201)
    } catch (error) {
      next(error)
    }
  }

  updateCurrency = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currency = await this.regionService.updateCurrency(req.params.id, req.body)
      sendSuccess(res, currency)
    } catch (error) {
      next(error)
    }
  }

  deleteCurrency = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.regionService.deleteCurrency(req.params.id)
      sendSuccess(res, { message: 'Currency deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
}

export function createRegionController(service: RegionService): RegionController {
  return new RegionController(service)
}

// ============================================
// Router
// ============================================

export interface CreateRegionRouterOptions {
  prisma: PrismaClient
  config: RegionModuleConfig
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
}

export function createRegionRouter(options: CreateRegionRouterOptions): Router {
  const { prisma, config, verifyToken } = options
  const router = Router()

  const service = createRegionService(prisma, config)
  const controller = createRegionController(service)

  const authenticate = verifyToken
    ? createAuthMiddleware({ verifyToken })
    : (_req: AuthenticatedRequest, _res: unknown, next: () => void) => next()

  // Public
  router.get('/regions', controller.listRegions)
  router.get('/regions/code/:code', validateParams(codeParamSchema), controller.getRegionByCode)
  router.get('/regions/country/:code', validateParams(codeParamSchema), controller.getRegionByCountry)
  router.get('/regions/:id', validateParams(idParamSchema), controller.getRegionById)
  router.get('/countries', controller.listCountries)
  router.get('/currencies', controller.listCurrencies)

  // Protected
  router.post('/regions', authenticate, requirePermissions('regions.create'), validateBody(createRegionSchema), controller.createRegion)
  router.put('/regions/:id', authenticate, requirePermissions('regions.update'), validateParams(idParamSchema), validateBody(updateRegionSchema), controller.updateRegion)
  router.delete('/regions/:id', authenticate, requirePermissions('regions.delete'), validateParams(idParamSchema), controller.deleteRegion)

  router.post('/currencies', authenticate, requirePermissions('regions.create'), validateBody(createCurrencySchema), controller.createCurrency)
  router.put('/currencies/:id', authenticate, requirePermissions('regions.update'), validateParams(idParamSchema), validateBody(updateCurrencySchema), controller.updateCurrency)
  router.delete('/currencies/:id', authenticate, requirePermissions('regions.delete'), validateParams(idParamSchema), controller.deleteCurrency)

  router.use(errorHandler)
  return router
}

// ============================================
// Quick Setup
// ============================================

export function setupRegionModule(options: {
  prisma: PrismaClient
  verifyToken?: (token: string) => Promise<AuthenticatedRequest['user']>
  defaultCurrency?: string
  defaultTaxRate?: number
}): Router {
  return createRegionRouter({
    prisma: options.prisma,
    config: {
      defaultCurrency: options.defaultCurrency || 'USD',
      defaultTaxRate: options.defaultTaxRate || 0,
    },
    verifyToken: options.verifyToken,
  })
}
