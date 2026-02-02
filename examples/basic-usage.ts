/**
 * Basic Usage Example
 *
 * This example shows how to use the core modules in different ways:
 * 1. Quick setup with all modules
 * 2. Individual module setup
 * 3. Using services directly
 */

import express from 'express'
import { PrismaClient } from '@prisma/client'
import {
  // Quick setup
  setupCoreModules,

  // Individual module setup
  setupUserModule,
  setupProductModule,
  setupOrderModule,
  setupCartModule,

  // Services for direct use
  createUserService,
  createProductService,
  createOrderService,

  // Event bus for inter-module communication
  getEventBus,
} from '../src/index.js'

const prisma = new PrismaClient()
const app = express()

// ============================================
// Option 1: Quick Setup (All Modules)
// ============================================

function quickSetup() {
  setupCoreModules(app, {
    prisma,
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    basePath: '/api',
    // Optionally disable specific modules
    modules: {
      users: true,
      products: true,
      orders: true,
      payments: true,
      cart: true,
      fulfillment: true,
      discounts: true,
      notifications: true,
      regions: true,
    },
  })

  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000')
  })
}

// ============================================
// Option 2: Individual Module Setup
// ============================================

function individualSetup() {
  app.use(express.json())

  // Set up only the modules you need
  const userRouter = setupUserModule({
    prisma,
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    features: {
      registration: true,
      passwordReset: true,
      apiKeys: true,
    },
    hooks: {
      afterRegister: async (user) => {
        console.log('New user registered:', user.email)
        // Send welcome email, etc.
      },
      afterLogin: async (user) => {
        console.log('User logged in:', user.email)
      },
    },
  })

  const productRouter = setupProductModule({
    prisma,
    // verifyToken: ... (use userService.verifyAccessToken)
    inventory: {
      trackInventory: true,
      lowStockThreshold: 10,
    },
    hooks: {
      onLowStock: async (variantId, quantity) => {
        console.log(`Low stock alert: ${variantId} has only ${quantity} items`)
      },
    },
  })

  const orderRouter = setupOrderModule({
    prisma,
    orderNumber: {
      prefix: 'ORD',
      length: 8,
    },
    hooks: {
      onOrderConfirmed: async (order) => {
        console.log('Order confirmed:', order.orderNumber)
        // Send confirmation email
      },
      onOrderShipped: async (order, trackingNumber) => {
        console.log('Order shipped:', order.orderNumber, trackingNumber)
        // Send shipping notification
      },
    },
  })

  const cartRouter = setupCartModule({
    prisma,
    expirationDays: 30,
    hooks: {
      onCartConverted: async (cartId, orderId) => {
        console.log('Cart converted to order:', cartId, '->', orderId)
      },
    },
  })

  // Mount routers
  app.use('/api', userRouter)
  app.use('/api', productRouter)
  app.use('/api', orderRouter)
  app.use('/api', cartRouter)

  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000')
  })
}

// ============================================
// Option 3: Using Services Directly
// ============================================

async function directServiceUsage() {
  // Create services
  const userService = createUserService(prisma, {
    jwt: { secret: 'your-secret', expiresIn: '1h' },
  })

  const productService = createProductService(prisma, {})

  const orderService = createOrderService(prisma, {
    orderNumber: { prefix: 'ORD', length: 8 },
  })

  // Use services directly
  const user = await userService.register({
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
  })

  console.log('Created user:', user.user.id)

  // Create a product
  const product = await productService.create({
    name: 'Test Product',
    description: 'A test product',
    status: 'active',
    variants: [
      {
        sku: 'TEST-001',
        name: 'Default',
        price: 29.99,
        quantity: 100,
      },
    ],
  })

  console.log('Created product:', product.id)

  // Create an order
  const order = await orderService.create({
    userId: user.user.id,
    email: user.user.email,
    items: [
      {
        variantId: product.variants[0].id,
        productName: product.name,
        variantName: product.variants[0].name,
        sku: product.variants[0].sku,
        quantity: 2,
        price: 29.99,
      },
    ],
    shippingAddress: {
      firstName: 'Test',
      lastName: 'User',
      address1: '123 Main St',
      city: 'New York',
      postalCode: '10001',
      country: 'US',
    },
  })

  console.log('Created order:', order.orderNumber)
}

// ============================================
// Option 4: Event-Driven Integration
// ============================================

function eventDrivenSetup() {
  const eventBus = getEventBus()

  // Listen to events from any module
  eventBus.on('user.created', ({ userId, email }) => {
    console.log(`New user: ${email} (${userId})`)
    // Create a default cart, send welcome email, etc.
  })

  eventBus.on('order.created', ({ orderId, userId, total }) => {
    console.log(`New order: ${orderId} by ${userId} for $${total}`)
    // Update analytics, notify admin, etc.
  })

  eventBus.on('payment.completed', ({ paymentId, orderId }) => {
    console.log(`Payment ${paymentId} completed for order ${orderId}`)
    // Trigger fulfillment, send receipt, etc.
  })

  eventBus.on('fulfillment.shipped', ({ fulfillmentId, trackingNumber }) => {
    console.log(`Fulfillment ${fulfillmentId} shipped: ${trackingNumber}`)
    // Send tracking email to customer
  })

  eventBus.on('product.stockUpdated', ({ productId, quantity }) => {
    console.log(`Product ${productId} stock: ${quantity}`)
    // Check for low stock alerts
  })

  // Set up modules
  setupCoreModules(app, {
    prisma,
    jwtSecret: 'your-secret',
  })

  app.listen(3000)
}

// ============================================
// Option 5: Payment Adapters Integration
// ============================================

import {
  createPaymentAdapters,
  createStripeAdapter,
  createRazorpayAdapter,
  setupPaymentModule,
} from '../src/modules/payments/index.js'

function paymentAdaptersSetup() {
  app.use(express.json())

  // Option A: Create adapters using factory function
  const adapters = createPaymentAdapters({
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    },
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID!,
      keySecret: process.env.RAZORPAY_KEY_SECRET!,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
    },
  })

  // Set up payment module with adapters
  const paymentRouter = setupPaymentModule({
    prisma,
    adapters,
    hooks: {
      onPaymentCompleted: async (payment) => {
        console.log('Payment completed:', payment.id)
      },
      onPaymentFailed: async (payment, error) => {
        console.log('Payment failed:', payment.id, error)
      },
    },
  })

  app.use('/api', paymentRouter)

  // Option B: Use adapters directly for custom flows
  const stripeAdapter = createStripeAdapter({
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  })

  const razorpayAdapter = createRazorpayAdapter({
    keyId: process.env.RAZORPAY_KEY_ID!,
    keySecret: process.env.RAZORPAY_KEY_SECRET!,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
  })

  // Stripe: Create payment intent for card payments
  app.post('/api/checkout/stripe', async (req, res) => {
    const { amount, currency, orderId } = req.body
    const result = await stripeAdapter.createPayment({
      amount,
      currency,
      orderId,
    })
    res.json({
      clientSecret: result.clientSecret,
      paymentId: result.providerPaymentId,
    })
  })

  // Razorpay: Create UPI payment (GPay, PhonePe, Paytm)
  app.post('/api/checkout/upi', async (req, res) => {
    const { amount, currency, orderId, customerEmail, customerPhone } = req.body
    const result = await razorpayAdapter.createUPIPayment({
      amount,
      currency,
      orderId,
      customerEmail,
      customerPhone,
      upiFlow: 'intent', // or 'collect' for VPA-based collection
    })
    res.json({
      shortUrl: result.shortUrl,
      paymentId: result.providerPaymentId,
    })
  })

  // Razorpay: Create QR code for UPI payment
  app.post('/api/checkout/upi-qr', async (req, res) => {
    const { amount, orderId } = req.body
    const result = await razorpayAdapter.createUPIQRCode({
      amount,
      orderId,
    })
    res.json({
      qrCodeId: result.qrCodeId,
      imageUrl: result.imageUrl,
    })
  })

  // Webhook handlers
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'] as string
    const event = await stripeAdapter.handleWebhook(req.body, signature)

    console.log('Stripe event:', event.event, event.paymentId, event.status)
    // Update your database based on the event

    res.json({ received: true })
  })

  app.post('/webhooks/razorpay', async (req, res) => {
    const signature = req.headers['x-razorpay-signature'] as string
    const event = await razorpayAdapter.handleWebhook(req.body, signature)

    console.log('Razorpay event:', event.event, event.paymentId, event.status, event.method)
    // Update your database based on the event

    res.json({ received: true })
  })

  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000')
  })
}

// ============================================
// API Endpoints Created
// ============================================

/*
After setup, the following endpoints are available:

AUTH:
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/logout
  POST /api/auth/refresh
  POST /api/auth/forgot-password
  POST /api/auth/reset-password
  POST /api/auth/change-password

USERS:
  GET  /api/me
  PUT  /api/me
  GET  /api/users
  POST /api/users
  GET  /api/users/:id
  PUT  /api/users/:id
  DELETE /api/users/:id
  GET  /api/roles
  POST /api/roles
  PUT  /api/roles/:id
  DELETE /api/roles/:id
  GET  /api/permissions
  GET  /api/api-keys
  POST /api/api-keys
  DELETE /api/api-keys/:keyId

PRODUCTS:
  GET  /api/products
  POST /api/products
  GET  /api/products/:id
  GET  /api/products/slug/:slug
  PUT  /api/products/:id
  DELETE /api/products/:id
  POST /api/products/:id/variants
  PUT  /api/products/:id/variants/:variantId
  DELETE /api/products/:id/variants/:variantId
  PUT  /api/products/:id/variants/:variantId/inventory
  GET  /api/categories
  POST /api/categories
  PUT  /api/categories/:id
  DELETE /api/categories/:id
  POST /api/products/:id/images
  DELETE /api/products/:id/images/:imageId
  PUT  /api/products/:id/images/reorder

CART:
  GET  /api/cart
  POST /api/cart/items
  PUT  /api/cart/:cartId/items/:itemId
  DELETE /api/cart/:cartId/items/:itemId
  POST /api/cart/discount
  DELETE /api/cart/:cartId/discount/:discountId
  DELETE /api/cart/:id

ORDERS:
  GET  /api/orders
  POST /api/orders
  GET  /api/orders/:id
  GET  /api/orders/number/:orderNumber
  PUT  /api/orders/:id
  POST /api/orders/:id/confirm
  POST /api/orders/:id/cancel
  GET  /api/orders/:id/events
  POST /api/orders/:id/events

PAYMENTS:
  GET  /api/payment-providers
  GET  /api/payments
  POST /api/payments
  GET  /api/payments/:id
  POST /api/payments/:id/capture
  POST /api/payments/:id/refund

FULFILLMENT:
  GET  /api/shipping-providers
  GET  /api/fulfillments
  POST /api/fulfillments
  GET  /api/fulfillments/:id
  POST /api/fulfillments/:id/ship
  PUT  /api/fulfillments/:id/status

DISCOUNTS:
  GET  /api/discounts
  POST /api/discounts
  GET  /api/discounts/:id
  PUT  /api/discounts/:id
  DELETE /api/discounts/:id
  POST /api/discounts/validate

NOTIFICATIONS:
  GET  /api/notifications
  POST /api/notifications
  GET  /api/notifications/:id
  POST /api/notifications/:id/retry
  GET  /api/notification-templates
  POST /api/notification-templates
  PUT  /api/notification-templates/:id
  DELETE /api/notification-templates/:id

REGIONS:
  GET  /api/regions
  POST /api/regions
  GET  /api/regions/:id
  GET  /api/regions/code/:code
  GET  /api/regions/country/:code
  PUT  /api/regions/:id
  DELETE /api/regions/:id
  GET  /api/countries
  GET  /api/currencies
  POST /api/currencies
  PUT  /api/currencies/:id
  DELETE /api/currencies/:id
*/

// Run example
// quickSetup()
// individualSetup()
// directServiceUsage()
// eventDrivenSetup()
// paymentAdaptersSetup()
