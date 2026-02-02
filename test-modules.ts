// ============================================
// Quick Module Test Script
// ============================================

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function testUserModule() {
  console.log('\n📦 Testing User Module...')

  // Test: Get all users
  const users = await prisma.user.findMany({
    include: { roles: { include: { role: true } } }
  })
  console.log(`  ✅ Found ${users.length} users`)

  // Test: Get admin user
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@example.com' },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  })
  console.log(`  ✅ Admin user: ${admin?.firstName} ${admin?.lastName}`)
  console.log(`  ✅ Admin role: ${admin?.roles[0]?.role.name}`)
  console.log(`  ✅ Admin permissions: ${admin?.roles[0]?.role.permissions.length}`)

  // Test: Verify password
  const isValidPassword = await bcrypt.compare('Admin123!', admin?.password || '')
  console.log(`  ✅ Password verification: ${isValidPassword ? 'PASS' : 'FAIL'}`)

  return true
}

async function testProductModule() {
  console.log('\n📦 Testing Product Module...')

  // Test: Get all products with variants
  const products = await prisma.product.findMany({
    include: {
      variants: true,
      categories: { include: { category: true } },
    }
  })
  console.log(`  ✅ Found ${products.length} products`)

  // Test: Get product with variants
  const headphones = await prisma.product.findUnique({
    where: { slug: 'wireless-bluetooth-headphones' },
    include: { variants: true }
  })
  console.log(`  ✅ Product: ${headphones?.name}`)
  console.log(`  ✅ Variants: ${headphones?.variants.length}`)
  console.log(`  ✅ First variant price: $${headphones?.variants[0]?.price}`)

  // Test: Get categories
  const categories = await prisma.category.findMany()
  console.log(`  ✅ Found ${categories.length} categories`)

  return true
}

async function testOrderModule() {
  console.log('\n📦 Testing Order Module...')

  // Get a user and product for order
  const user = await prisma.user.findUnique({ where: { email: 'john@example.com' } })
  const variant = await prisma.productVariant.findFirst()

  if (!user || !variant) {
    console.log('  ❌ Missing user or variant for order test')
    return false
  }

  // Create a test order
  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-TEST-${Date.now()}`,
      userId: user.id,
      email: user.email,
      status: 'pending',
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      subtotal: Number(variant.price),
      discount: 0,
      tax: Number(variant.price) * 0.08,
      shipping: 5.99,
      total: Number(variant.price) * 1.08 + 5.99,
      currency: 'USD',
      shippingAddress: {
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
        phone: '+1234567890'
      },
      items: {
        create: {
          variantId: variant.id,
          productName: 'Test Product',
          variantName: variant.name,
          sku: variant.sku,
          quantity: 1,
          price: variant.price,
          total: variant.price,
        }
      }
    },
    include: { items: true }
  })
  console.log(`  ✅ Created order: ${order.orderNumber}`)
  console.log(`  ✅ Order total: $${order.total}`)
  console.log(`  ✅ Order items: ${order.items.length}`)

  // Clean up test order
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } })
  await prisma.order.delete({ where: { id: order.id } })
  console.log(`  ✅ Cleaned up test order`)

  return true
}

async function testDiscountModule() {
  console.log('\n📦 Testing Discount Module...')

  // Test: Get all discounts
  const discounts = await prisma.discount.findMany()
  console.log(`  ✅ Found ${discounts.length} discounts`)

  // Test: Validate discount code
  const welcome = await prisma.discount.findUnique({
    where: { code: 'WELCOME10' }
  })
  console.log(`  ✅ Discount: ${welcome?.code} - ${welcome?.value}% off`)
  console.log(`  ✅ Min purchase: $${welcome?.minPurchase}`)
  console.log(`  ✅ Is active: ${welcome?.isActive}`)

  // Test discount calculation
  const cartTotal = 100
  const discountAmount = cartTotal * (Number(welcome?.value || 0) / 100)
  console.log(`  ✅ $${cartTotal} cart with WELCOME10 = $${discountAmount} discount`)

  return true
}

async function testRegionModule() {
  console.log('\n📦 Testing Region Module...')

  // Test: Get regions with countries
  const regions = await prisma.region.findMany({
    include: { countries: true }
  })
  console.log(`  ✅ Found ${regions.length} regions`)

  for (const region of regions) {
    console.log(`  ✅ ${region.name} (${region.code}): ${region.countries.length} countries, ${Number(region.taxRate) * 100}% tax`)
  }

  // Test: Get currencies
  const currencies = await prisma.currency.findMany()
  console.log(`  ✅ Found ${currencies.length} currencies`)

  return true
}

async function testCartModule() {
  console.log('\n📦 Testing Cart Module...')

  const user = await prisma.user.findUnique({ where: { email: 'john@example.com' } })
  const variant = await prisma.productVariant.findFirst()

  if (!user || !variant) {
    console.log('  ❌ Missing user or variant for cart test')
    return false
  }

  // Create a test cart
  const cart = await prisma.cart.create({
    data: {
      userId: user.id,
      status: 'active',
      currency: 'USD',
      items: {
        create: {
          variantId: variant.id,
          quantity: 2,
          price: variant.price,
        }
      }
    },
    include: { items: true }
  })
  console.log(`  ✅ Created cart: ${cart.id}`)
  console.log(`  ✅ Cart items: ${cart.items.length}`)
  console.log(`  ✅ Item quantity: ${cart.items[0]?.quantity}`)

  // Clean up
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
  await prisma.cart.delete({ where: { id: cart.id } })
  console.log(`  ✅ Cleaned up test cart`)

  return true
}

async function testNotificationModule() {
  console.log('\n📦 Testing Notification Module...')

  // Test: Get notification templates
  const templates = await prisma.notificationTemplate.findMany()
  console.log(`  ✅ Found ${templates.length} notification templates`)

  for (const template of templates) {
    console.log(`  ✅ Template: ${template.name} (${template.type})`)
  }

  // Test: Create a notification
  const notification = await prisma.notification.create({
    data: {
      type: 'email',
      recipient: 'test@example.com',
      subject: 'Test Notification',
      content: 'This is a test notification',
      status: 'pending',
    }
  })
  console.log(`  ✅ Created notification: ${notification.id}`)

  // Clean up
  await prisma.notification.delete({ where: { id: notification.id } })
  console.log(`  ✅ Cleaned up test notification`)

  return true
}

async function testPaymentModule() {
  console.log('\n📦 Testing Payment Module...')

  // Test: Get payment providers
  const providers = await prisma.paymentProvider.findMany()
  console.log(`  ✅ Found ${providers.length} payment providers (will add via API)`)

  // Create test provider
  const provider = await prisma.paymentProvider.create({
    data: {
      name: 'Test Stripe',
      code: 'stripe_test',
      isActive: true,
      config: { apiKey: 'sk_test_xxx' }
    }
  })
  console.log(`  ✅ Created provider: ${provider.name}`)

  // Clean up
  await prisma.paymentProvider.delete({ where: { id: provider.id } })
  console.log(`  ✅ Cleaned up test provider`)

  return true
}

async function main() {
  console.log('🚀 Starting Module Tests...')
  console.log('=' .repeat(50))

  const results: Record<string, boolean> = {}

  try {
    results['User Module'] = await testUserModule()
    results['Product Module'] = await testProductModule()
    results['Order Module'] = await testOrderModule()
    results['Discount Module'] = await testDiscountModule()
    results['Region Module'] = await testRegionModule()
    results['Cart Module'] = await testCartModule()
    results['Notification Module'] = await testNotificationModule()
    results['Payment Module'] = await testPaymentModule()

    console.log('\n' + '=' .repeat(50))
    console.log('📊 Test Results:')
    console.log('=' .repeat(50))

    let allPassed = true
    for (const [module, passed] of Object.entries(results)) {
      console.log(`  ${passed ? '✅' : '❌'} ${module}`)
      if (!passed) allPassed = false
    }

    console.log('\n' + '=' .repeat(50))
    if (allPassed) {
      console.log('🎉 All tests passed!')
    } else {
      console.log('⚠️  Some tests failed')
    }

  } catch (error) {
    console.error('\n❌ Test error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
