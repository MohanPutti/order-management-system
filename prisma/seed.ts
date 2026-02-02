// ============================================
// Database Seed Script
// ============================================

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

const prisma = new PrismaClient()

// ============================================
// Seed Data
// ============================================

const permissions = [
  // Users module
  { name: 'users.create', module: 'users', action: 'create', description: 'Create users' },
  { name: 'users.read', module: 'users', action: 'read', description: 'View users' },
  { name: 'users.update', module: 'users', action: 'update', description: 'Update users' },
  { name: 'users.delete', module: 'users', action: 'delete', description: 'Delete users' },
  // Products module
  { name: 'products.create', module: 'products', action: 'create', description: 'Create products' },
  { name: 'products.read', module: 'products', action: 'read', description: 'View products' },
  { name: 'products.update', module: 'products', action: 'update', description: 'Update products' },
  { name: 'products.delete', module: 'products', action: 'delete', description: 'Delete products' },
  // Orders module
  { name: 'orders.create', module: 'orders', action: 'create', description: 'Create orders' },
  { name: 'orders.read', module: 'orders', action: 'read', description: 'View orders' },
  { name: 'orders.update', module: 'orders', action: 'update', description: 'Update orders' },
  { name: 'orders.delete', module: 'orders', action: 'delete', description: 'Delete orders' },
  // Payments module
  { name: 'payments.read', module: 'payments', action: 'read', description: 'View payments' },
  { name: 'payments.create', module: 'payments', action: 'create', description: 'Create payments' },
  { name: 'payments.refund', module: 'payments', action: 'refund', description: 'Refund payments' },
  // Discounts module
  { name: 'discounts.create', module: 'discounts', action: 'create', description: 'Create discounts' },
  { name: 'discounts.read', module: 'discounts', action: 'read', description: 'View discounts' },
  { name: 'discounts.update', module: 'discounts', action: 'update', description: 'Update discounts' },
  { name: 'discounts.delete', module: 'discounts', action: 'delete', description: 'Delete discounts' },
  // Regions module
  { name: 'regions.create', module: 'regions', action: 'create', description: 'Create regions' },
  { name: 'regions.read', module: 'regions', action: 'read', description: 'View regions' },
  { name: 'regions.update', module: 'regions', action: 'update', description: 'Update regions' },
  { name: 'regions.delete', module: 'regions', action: 'delete', description: 'Delete regions' },
  // Notifications module
  { name: 'notifications.read', module: 'notifications', action: 'read', description: 'View notifications' },
  { name: 'notifications.send', module: 'notifications', action: 'send', description: 'Send notifications' },
  { name: 'notifications.manage', module: 'notifications', action: 'manage', description: 'Manage notification templates' },
  // Fulfillment module
  { name: 'fulfillment.read', module: 'fulfillment', action: 'read', description: 'View fulfillments' },
  { name: 'fulfillment.create', module: 'fulfillment', action: 'create', description: 'Create shipments' },
  { name: 'fulfillment.update', module: 'fulfillment', action: 'update', description: 'Update shipments' },
]

const roles = [
  { name: 'admin', description: 'Administrator with full access', isSystem: true },
  { name: 'manager', description: 'Store manager with order and product access', isSystem: false },
  { name: 'customer', description: 'Regular customer', isSystem: true },
  { name: 'support', description: 'Customer support staff', isSystem: false },
]

const currencies = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, isActive: true },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, isActive: true },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, isActive: true },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2, isActive: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, isActive: true },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, isActive: true },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2, isActive: true },
]

const countries = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
]

const regions = [
  { name: 'North America', code: 'NA', currency: 'USD', taxRate: 0.08, countryCodes: ['US', 'CA'] },
  { name: 'Europe', code: 'EU', currency: 'EUR', taxRate: 0.20, countryCodes: ['GB', 'DE', 'FR', 'IT', 'ES'] },
  { name: 'Asia Pacific', code: 'APAC', currency: 'USD', taxRate: 0.10, countryCodes: ['IN', 'AU', 'JP'] },
]

const categories = [
  { name: 'Electronics', slug: 'electronics', description: 'Electronic devices and accessories' },
  { name: 'Clothing', slug: 'clothing', description: 'Apparel and fashion items' },
  { name: 'Home & Garden', slug: 'home-garden', description: 'Home decor and garden supplies' },
  { name: 'Books', slug: 'books', description: 'Books and educational materials' },
  { name: 'Sports', slug: 'sports', description: 'Sports equipment and fitness gear' },
]

const products = [
  {
    name: 'Wireless Bluetooth Headphones',
    slug: 'wireless-bluetooth-headphones',
    description: 'High-quality wireless headphones with noise cancellation',
    status: 'active' as const,
    category: 'electronics',
    variants: [
      { sku: 'WBH-BLK', name: 'Black', price: 79.99, quantity: 100 },
      { sku: 'WBH-WHT', name: 'White', price: 79.99, quantity: 75 },
      { sku: 'WBH-BLU', name: 'Blue', price: 84.99, quantity: 50 },
    ],
  },
  {
    name: 'Smart Watch Pro',
    slug: 'smart-watch-pro',
    description: 'Advanced smartwatch with health monitoring',
    status: 'active' as const,
    category: 'electronics',
    variants: [
      { sku: 'SWP-40-BLK', name: '40mm Black', price: 299.99, quantity: 50 },
      { sku: 'SWP-44-BLK', name: '44mm Black', price: 329.99, quantity: 40 },
      { sku: 'SWP-44-SLV', name: '44mm Silver', price: 329.99, quantity: 30 },
    ],
  },
  {
    name: 'Classic Cotton T-Shirt',
    slug: 'classic-cotton-tshirt',
    description: 'Comfortable 100% cotton t-shirt',
    status: 'active' as const,
    category: 'clothing',
    variants: [
      { sku: 'CCT-S-WHT', name: 'Small White', price: 24.99, quantity: 200 },
      { sku: 'CCT-M-WHT', name: 'Medium White', price: 24.99, quantity: 250 },
      { sku: 'CCT-L-WHT', name: 'Large White', price: 24.99, quantity: 200 },
      { sku: 'CCT-S-BLK', name: 'Small Black', price: 24.99, quantity: 180 },
      { sku: 'CCT-M-BLK', name: 'Medium Black', price: 24.99, quantity: 220 },
      { sku: 'CCT-L-BLK', name: 'Large Black', price: 24.99, quantity: 190 },
    ],
  },
  {
    name: 'Ceramic Plant Pot Set',
    slug: 'ceramic-plant-pot-set',
    description: 'Set of 3 decorative ceramic plant pots',
    status: 'active' as const,
    category: 'home-garden',
    variants: [
      { sku: 'CPP-WHT', name: 'White Set', price: 45.99, quantity: 60 },
      { sku: 'CPP-TER', name: 'Terracotta Set', price: 45.99, quantity: 45 },
    ],
  },
  {
    name: 'Programming in TypeScript',
    slug: 'programming-typescript',
    description: 'Complete guide to TypeScript development',
    status: 'active' as const,
    category: 'books',
    variants: [
      { sku: 'PTS-PB', name: 'Paperback', price: 39.99, quantity: 100 },
      { sku: 'PTS-HB', name: 'Hardcover', price: 54.99, quantity: 50 },
      { sku: 'PTS-EB', name: 'eBook', price: 29.99, quantity: 999 },
    ],
  },
  {
    name: 'Yoga Mat Premium',
    slug: 'yoga-mat-premium',
    description: 'Extra thick, non-slip yoga mat',
    status: 'active' as const,
    category: 'sports',
    variants: [
      { sku: 'YMP-PUR', name: 'Purple', price: 49.99, quantity: 80 },
      { sku: 'YMP-BLU', name: 'Blue', price: 49.99, quantity: 70 },
      { sku: 'YMP-GRN', name: 'Green', price: 49.99, quantity: 60 },
    ],
  },
]

const discounts = [
  {
    code: 'WELCOME10',
    description: 'Welcome discount for new customers',
    type: 'percentage' as const,
    value: 10,
    minPurchase: 50,
    maxUses: 1000,
    isActive: true,
  },
  {
    code: 'SUMMER25',
    description: 'Summer sale - 25% off',
    type: 'percentage' as const,
    value: 25,
    minPurchase: 100,
    maxUses: 500,
    isActive: true,
    endsAt: new Date('2025-09-01'),
  },
  {
    code: 'FLAT20',
    description: '$20 off on orders above $150',
    type: 'fixed_amount' as const,
    value: 20,
    minPurchase: 150,
    isActive: true,
  },
  {
    code: 'FREESHIP',
    description: 'Free shipping on all orders',
    type: 'free_shipping' as const,
    value: 0,
    minPurchase: 75,
    isActive: true,
  },
]

const notificationTemplates = [
  {
    name: 'welcome_email',
    type: 'email' as const,
    subject: 'Welcome to {{storeName}}!',
    content: 'Hi {{firstName}},\n\nWelcome to {{storeName}}! We\'re excited to have you.\n\nStart shopping now and enjoy our great products.\n\nBest regards,\nThe {{storeName}} Team',
    variables: ['firstName', 'storeName'],
  },
  {
    name: 'order_confirmation',
    type: 'email' as const,
    subject: 'Order Confirmation - #{{orderNumber}}',
    content: 'Hi {{firstName}},\n\nThank you for your order!\n\nOrder Number: {{orderNumber}}\nTotal: {{total}}\n\nWe\'ll notify you when your order ships.\n\nBest regards,\nThe {{storeName}} Team',
    variables: ['firstName', 'orderNumber', 'total', 'storeName'],
  },
  {
    name: 'shipping_notification',
    type: 'email' as const,
    subject: 'Your order #{{orderNumber}} has shipped!',
    content: 'Hi {{firstName}},\n\nGreat news! Your order has shipped.\n\nTracking Number: {{trackingNumber}}\nCarrier: {{carrier}}\n\nTrack your package: {{trackingUrl}}\n\nBest regards,\nThe {{storeName}} Team',
    variables: ['firstName', 'orderNumber', 'trackingNumber', 'carrier', 'trackingUrl', 'storeName'],
  },
  {
    name: 'password_reset',
    type: 'email' as const,
    subject: 'Reset Your Password',
    content: 'Hi {{firstName}},\n\nWe received a request to reset your password.\n\nClick here to reset: {{resetUrl}}\n\nThis link expires in 1 hour.\n\nIf you didn\'t request this, please ignore this email.\n\nBest regards,\nThe {{storeName}} Team',
    variables: ['firstName', 'resetUrl', 'storeName'],
  },
  {
    name: 'order_sms',
    type: 'sms' as const,
    subject: null,
    content: '{{storeName}}: Your order #{{orderNumber}} is confirmed! Total: {{total}}. Track at {{trackingUrl}}',
    variables: ['storeName', 'orderNumber', 'total', 'trackingUrl'],
  },
]

// ============================================
// Seed Functions
// ============================================

async function seedPermissions() {
  console.log('Seeding permissions...')
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {},
      create: permission,
    })
  }
}

async function seedRoles() {
  console.log('Seeding roles...')
  const allPermissions = await prisma.permission.findMany()

  for (const role of roles) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    })

    // Assign permissions based on role
    let rolePermissions: string[] = []
    if (role.name === 'admin') {
      rolePermissions = allPermissions.map(p => p.id)
    } else if (role.name === 'manager') {
      rolePermissions = allPermissions
        .filter(p => ['products', 'orders', 'fulfillment', 'discounts'].includes(p.module))
        .map(p => p.id)
    } else if (role.name === 'support') {
      rolePermissions = allPermissions
        .filter(p => ['orders', 'users'].includes(p.module) && p.action === 'read')
        .map(p => p.id)
    }

    // Clear existing role permissions and add new ones
    await prisma.rolePermission.deleteMany({ where: { roleId: createdRole.id } })
    for (const permId of rolePermissions) {
      await prisma.rolePermission.create({
        data: { roleId: createdRole.id, permissionId: permId },
      })
    }
  }
}

async function seedUsers() {
  console.log('Seeding users...')

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } })
  const customerRole = await prisma.role.findUnique({ where: { name: 'customer' } })
  const managerRole = await prisma.role.findUnique({ where: { name: 'manager' } })

  const users = [
    {
      email: 'admin@example.com',
      password: await bcrypt.hash('Admin123!', 10),
      firstName: 'System',
      lastName: 'Admin',
      isVerified: true,
      verifiedAt: new Date(),
      roleId: adminRole?.id,
    },
    {
      email: 'manager@example.com',
      password: await bcrypt.hash('Manager123!', 10),
      firstName: 'Store',
      lastName: 'Manager',
      isVerified: true,
      verifiedAt: new Date(),
      roleId: managerRole?.id,
    },
    {
      email: 'john@example.com',
      password: await bcrypt.hash('Customer123!', 10),
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      isVerified: true,
      verifiedAt: new Date(),
      roleId: customerRole?.id,
    },
    {
      email: 'jane@example.com',
      password: await bcrypt.hash('Customer123!', 10),
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+1987654321',
      isVerified: true,
      verifiedAt: new Date(),
      roleId: customerRole?.id,
    },
  ]

  for (const userData of users) {
    const { roleId, ...userDataWithoutRole } = userData
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: userDataWithoutRole,
    })

    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      })
    }
  }
}

async function seedCurrencies() {
  console.log('Seeding currencies...')
  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    })
  }
}

async function seedCountries() {
  console.log('Seeding countries...')
  for (const country of countries) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: {},
      create: country,
    })
  }
}

async function seedRegions() {
  console.log('Seeding regions...')
  for (const region of regions) {
    const { countryCodes, ...regionData } = region
    const createdRegion = await prisma.region.upsert({
      where: { code: regionData.code },
      update: {},
      create: regionData,
    })

    // Assign countries to region
    await prisma.country.updateMany({
      where: { code: { in: countryCodes } },
      data: { regionId: createdRegion.id },
    })
  }
}

async function seedCategories() {
  console.log('Seeding categories...')
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    })
  }
}

async function seedProducts() {
  console.log('Seeding products...')
  for (const product of products) {
    const category = await prisma.category.findUnique({ where: { slug: product.category } })

    const createdProduct = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: {
        name: product.name,
        slug: product.slug,
        description: product.description,
        status: product.status,
      },
    })

    // Add variants
    for (const variant of product.variants) {
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {},
        create: {
          productId: createdProduct.id,
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          quantity: variant.quantity,
          isDefault: variant === product.variants[0],
        },
      })
    }

    // Add category relation
    if (category) {
      await prisma.productCategory.upsert({
        where: { productId_categoryId: { productId: createdProduct.id, categoryId: category.id } },
        update: {},
        create: { productId: createdProduct.id, categoryId: category.id },
      })
    }
  }
}

async function seedDiscounts() {
  console.log('Seeding discounts...')
  for (const discount of discounts) {
    await prisma.discount.upsert({
      where: { code: discount.code },
      update: {},
      create: discount,
    })
  }
}

async function seedNotificationTemplates() {
  console.log('Seeding notification templates...')
  for (const template of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { name: template.name },
      update: {},
      create: template,
    })
  }
}

// ============================================
// Main Seed Function
// ============================================

async function main() {
  console.log('Starting database seed...\n')

  try {
    await seedPermissions()
    await seedRoles()
    await seedUsers()
    await seedCurrencies()
    await seedCountries()
    await seedRegions()
    await seedCategories()
    await seedProducts()
    await seedDiscounts()
    await seedNotificationTemplates()

    console.log('\nDatabase seeding completed successfully!')
  } catch (error) {
    console.error('Error during seeding:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
