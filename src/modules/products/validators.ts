import { z } from 'zod'

// ============================================
// Product Validators
// ============================================

export const productStatusSchema = z.enum(['draft', 'active', 'archived'])

export const createVariantSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  price: z.number().min(0),
  comparePrice: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  quantity: z.number().int().min(0).optional().default(0),
  weight: z.number().min(0).optional(),
  options: z.record(z.string()).optional(),
  isDefault: z.boolean().optional(),
})

export const updateVariantSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  price: z.number().min(0).optional(),
  comparePrice: z.number().min(0).nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  quantity: z.number().int().min(0).optional(),
  weight: z.number().min(0).nullable().optional(),
  options: z.record(z.string()).optional(),
  isDefault: z.boolean().optional(),
})

export const createImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(255).optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: productStatusSchema.optional().default('draft'),
  metadata: z.record(z.unknown()).optional(),
  variants: z.array(createVariantSchema).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  images: z.array(createImageSchema).optional(),
})

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  status: productStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
})

export const updateInventorySchema = z.object({
  quantity: z.number().int(),
  reason: z.string().max(255).optional(),
})

// ============================================
// Category Validators
// ============================================

export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

// ============================================
// Query Validators
// ============================================

export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().uuid().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
})

export const reorderImagesSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1),
})

// ============================================
// Zod Inferred Types (for internal validation use)
// Note: Canonical types are in types.ts
// ============================================

export type ProductQueryInput = z.infer<typeof productQuerySchema>
