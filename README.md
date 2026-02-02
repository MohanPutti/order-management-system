# Core Modules - Order Management System

A flexible, plug-and-play modular framework for building e-commerce and order management applications. Each module can be used independently or combined to create a complete system.

## Features

- **Modular Architecture** - Use only what you need
- **Plug-and-Play** - Easy integration with any Express.js application
- **Fully Typed** - Complete TypeScript support with type safety
- **Configurable** - Extensive configuration options for each module
- **Extensible** - Hook system for custom business logic
- **Event-Driven** - Type-safe event bus for inter-module communication
- **Adapter Pattern** - Pluggable adapters for external services (payments, shipping, notifications)

## Modules

| Module | Description |
|--------|-------------|
| **Users** | Authentication, authorization, roles, permissions, OAuth, API keys |
| **Products** | Catalog management, variants, categories, inventory |
| **Orders** | Order lifecycle, items, status tracking, events |
| **Payments** | Payment processing with provider adapters (Stripe, Razorpay) |
| **Cart** | Shopping cart operations, guest carts, discount application |
| **Fulfillment** | Shipping, tracking, delivery with provider adapters |
| **Discounts** | Coupon codes, discount rules, usage limits |
| **Notifications** | Email, SMS, push notifications with provider adapters |
| **Regions** | Multi-region support, currencies, tax rates |

## Installation

```bash
npm install @core/modules
```

## Quick Start

### Option 1: Setup All Modules

The quickest way to get started with all modules:

```typescript
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { setupCoreModules } from '@core/modules'

const app = express()
const prisma = new PrismaClient()

app.use(express.json())

// Setup all modules at once
setupCoreModules(app, {
  prisma,
  jwtSecret: process.env.JWT_SECRET!,
  basePath: '/api',
  modules: {
    users: true,
    products: true,
    orders: true,
    payments: true,
    cart: true,
    fulfillment: true,
    discounts: true,
    notifications: true,
    regions: true
  }
})

app.listen(3000)
```

### Option 2: Setup Individual Modules

Use only the modules you need:

```typescript
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { setupUserModule, setupProductModule, setupOrderModule } from '@core/modules'

const app = express()
const prisma = new PrismaClient()

app.use(express.json())

// Setup user module (includes auth)
const userRouter = setupUserModule({
  prisma,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: '1h',
  features: {
    registration: true,
    emailVerification: true,
    passwordReset: true
  }
})
app.use('/api', userRouter)

// Setup product module
const productRouter = setupProductModule({
  prisma,
  verifyToken: async (token) => { /* verify JWT */ },
  config: {
    features: {
      softDelete: true,
      categories: true,
      images: true
    },
    inventory: {
      trackInventory: true,
      lowStockThreshold: 10
    }
  }
})
app.use('/api', productRouter)

app.listen(3000)
```

### Option 3: Use Services Directly

For custom implementations or non-Express applications:

```typescript
import { PrismaClient } from '@prisma/client'
import { createUserService, createProductService, createOrderService } from '@core/modules'

const prisma = new PrismaClient()

// Create services
const userService = createUserService(prisma, {
  jwt: { secret: 'your-secret', expiresIn: '1h' }
})

const productService = createProductService(prisma, {
  features: { softDelete: true }
})

const orderService = createOrderService(prisma, {
  orderNumber: { prefix: 'ORD', length: 8 }
})

// Use services
const user = await userService.register({
  email: 'user@example.com',
  password: 'password123',
  firstName: 'John',
  lastName: 'Doe'
})

const product = await productService.create({
  name: 'Awesome Product',
  description: 'A great product',
  variants: [{
    sku: 'SKU-001',
    name: 'Default',
    price: 29.99,
    quantity: 100
  }]
})

const order = await orderService.create({
  userId: user.user.id,
  email: user.user.email,
  items: [{
    variantId: product.variants[0].id,
    productName: product.name,
    variantName: 'Default',
    sku: 'SKU-001',
    quantity: 2,
    price: 29.99
  }],
  shippingAddress: {
    street: '123 Main St',
    city: 'New York',
    country: 'US'
  }
})
```

## Module Documentation

### Users Module

Handles authentication, authorization, and user management.

```typescript
import { setupUserModule } from '@core/modules'

const router = setupUserModule({
  prisma,
  jwtSecret: 'your-secret',
  jwtExpiresIn: '1h',
  refreshSecret: 'refresh-secret',

  // OAuth providers
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: '/auth/google/callback'
  },

  // Feature flags
  features: {
    registration: true,
    emailVerification: true,
    passwordReset: true,
    apiKeys: true,
    softDelete: true,
    oauth: true
  },

  // Lifecycle hooks
  hooks: {
    afterRegister: async (user) => {
      console.log('New user:', user.email)
      // Send welcome email, create default cart, etc.
    },
    afterLogin: async (user, tokens) => {
      console.log('User logged in:', user.email)
    },
    onPasswordResetRequest: async (user, token) => {
      // Send password reset email
    }
  }
})
```

**API Endpoints:**
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `POST /auth/refresh` - Refresh tokens
- `POST /auth/password/change` - Change password
- `POST /auth/password/reset-request` - Request password reset
- `POST /auth/password/reset` - Reset password
- `GET /users` - List users (admin)
- `GET /users/:id` - Get user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user
- `POST /users/:id/roles` - Assign role
- `DELETE /users/:id/roles/:roleId` - Remove role

### Products Module

Manages product catalog, variants, categories, and inventory.

```typescript
import { setupProductModule } from '@core/modules'

const router = setupProductModule({
  prisma,
  verifyToken,
  config: {
    features: {
      softDelete: true,
      variantOptions: true,
      categories: true,
      images: true
    },
    inventory: {
      trackInventory: true,
      allowNegative: false,
      lowStockThreshold: 10
    },
    hooks: {
      afterCreate: async (product) => {
        console.log('Product created:', product.name)
      },
      onLowStock: async (variantId, quantity) => {
        // Send low stock notification
      },
      onInventoryChange: async (variantId, oldQty, newQty) => {
        // Log inventory changes
      }
    }
  }
})
```

**API Endpoints:**
- `GET /products` - List products (with filters)
- `GET /products/:id` - Get product
- `GET /products/slug/:slug` - Get product by slug
- `POST /products` - Create product
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product
- `POST /products/:id/variants` - Add variant
- `PUT /products/variants/:id` - Update variant
- `DELETE /products/variants/:id` - Delete variant
- `PUT /products/variants/:id/inventory` - Update inventory
- `GET /categories` - List categories
- `POST /categories` - Create category
- `PUT /categories/:id` - Update category
- `DELETE /categories/:id` - Delete category

### Orders Module

Handles order lifecycle, status management, and tracking.

```typescript
import { setupOrderModule } from '@core/modules'

const router = setupOrderModule({
  prisma,
  verifyToken,
  config: {
    orderNumber: {
      prefix: 'ORD',
      length: 8
    },
    autoTransitions: {
      confirmOnPayment: true,
      completeOnFulfillment: true
    },
    features: {
      allowEdit: true,
      allowCancel: true,
      trackEvents: true
    },
    hooks: {
      afterCreate: async (order) => {
        // Send order confirmation email
      },
      onStatusChange: async (orderId, oldStatus, newStatus) => {
        // Log status changes, send notifications
      },
      onOrderConfirmed: async (order) => {
        // Start fulfillment process
      },
      onOrderCancelled: async (order, reason) => {
        // Process refund, restore inventory
      }
    }
  }
})
```

**API Endpoints:**
- `GET /orders` - List orders
- `GET /orders/:id` - Get order
- `GET /orders/number/:orderNumber` - Get order by number
- `POST /orders` - Create order
- `PUT /orders/:id` - Update order
- `POST /orders/:id/confirm` - Confirm order
- `POST /orders/:id/cancel` - Cancel order
- `GET /orders/:id/events` - Get order events
- `POST /orders/:id/events` - Add order event

### Payments Module

Processes payments with pluggable adapters.

```typescript
import { setupPaymentModule, StripeAdapter, RazorpayAdapter } from '@core/modules'

const router = setupPaymentModule({
  prisma,
  verifyToken,
  config: {
    defaultCurrency: 'USD',
    adapters: {
      stripe: new StripeAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
      }),
      razorpay: new RazorpayAdapter({
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET
      })
    },
    hooks: {
      onPaymentCompleted: async (payment) => {
        // Update order status, send receipt
      },
      onPaymentFailed: async (payment, error) => {
        // Notify customer, log error
      },
      onRefundCompleted: async (payment, refund) => {
        // Update order, notify customer
      }
    }
  }
})
```

**API Endpoints:**
- `POST /payments` - Create payment
- `GET /payments/:id` - Get payment
- `POST /payments/:id/capture` - Capture payment
- `POST /payments/:id/refund` - Refund payment
- `POST /payments/webhook/:provider` - Webhook handler

### Cart Module

Manages shopping carts with guest and authenticated support.

```typescript
import { setupCartModule } from '@core/modules'

const router = setupCartModule({
  prisma,
  verifyToken,
  config: {
    expirationDays: 30,
    defaultCurrency: 'USD',
    hooks: {
      onItemAdded: async (cartId, item) => {
        // Track analytics
      },
      onCartConverted: async (cartId, orderId) => {
        // Clear cart, track conversion
      }
    }
  }
})
```

**API Endpoints:**
- `POST /cart` - Create cart
- `GET /cart/:id` - Get cart
- `POST /cart/:id/items` - Add item
- `PUT /cart/:id/items/:itemId` - Update item
- `DELETE /cart/:id/items/:itemId` - Remove item
- `POST /cart/:id/discount` - Apply discount
- `DELETE /cart/:id/discount` - Remove discount
- `POST /cart/:id/convert` - Convert to order

### Fulfillment Module

Handles shipping and delivery with provider adapters.

```typescript
import { setupFulfillmentModule, ShippoAdapter, ShiprocketAdapter } from '@core/modules'

const router = setupFulfillmentModule({
  prisma,
  verifyToken,
  config: {
    adapters: {
      shippo: new ShippoAdapter({ apiKey: process.env.SHIPPO_API_KEY }),
      shiprocket: new ShiprocketAdapter({
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD
      })
    },
    hooks: {
      onFulfillmentShipped: async (fulfillment) => {
        // Send shipping notification
      },
      onFulfillmentDelivered: async (fulfillment) => {
        // Update order status
      }
    }
  }
})
```

**API Endpoints:**
- `POST /fulfillments` - Create fulfillment
- `GET /fulfillments/:id` - Get fulfillment
- `PUT /fulfillments/:id` - Update fulfillment
- `POST /fulfillments/:id/ship` - Mark as shipped
- `POST /fulfillments/:id/deliver` - Mark as delivered
- `GET /fulfillments/:id/tracking` - Get tracking info

### Notifications Module

Sends notifications via multiple channels.

```typescript
import { setupNotificationModule, SendGridAdapter, TwilioAdapter, FCMAdapter } from '@core/modules'

const router = setupNotificationModule({
  prisma,
  verifyToken,
  config: {
    adapters: {
      email: new SendGridAdapter({ apiKey: process.env.SENDGRID_API_KEY }),
      sms: new TwilioAdapter({
        accountSid: process.env.TWILIO_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM
      }),
      push: new FCMAdapter({ serviceAccount: require('./firebase-config.json') })
    }
  }
})
```

**API Endpoints:**
- `POST /notifications` - Send notification
- `GET /notifications` - List notifications
- `GET /notifications/:id` - Get notification

## Event System

The framework includes a type-safe event bus for inter-module communication.

```typescript
import { getEventBus } from '@core/modules'

const eventBus = getEventBus()

// Subscribe to events
eventBus.on('user.created', (data) => {
  console.log('New user:', data.userId)
})

eventBus.on('order.created', (data) => {
  console.log('New order:', data.orderId, 'Total:', data.total)
})

eventBus.on('payment.completed', (data) => {
  console.log('Payment completed:', data.paymentId)
})

eventBus.on('product.stockUpdated', (data) => {
  console.log('Stock updated:', data.productId)
})

// Emit events (modules do this automatically)
eventBus.emit('notification.send', {
  channel: 'email',
  recipient: 'user@example.com',
  template: 'welcome'
})
```

**Available Events:**

| Category | Events |
|----------|--------|
| User | `user.created`, `user.updated`, `user.deleted`, `user.login`, `user.logout`, `user.passwordChanged` |
| Role | `role.created`, `role.updated`, `role.deleted` |
| Product | `product.created`, `product.updated`, `product.deleted`, `product.stockUpdated` |
| Order | `order.created`, `order.updated`, `order.cancelled`, `order.completed`, `order.refunded` |
| Payment | `payment.initiated`, `payment.completed`, `payment.failed`, `payment.refunded` |
| Cart | `cart.created`, `cart.itemAdded`, `cart.itemRemoved`, `cart.converted`, `cart.abandoned` |
| Fulfillment | `fulfillment.created`, `fulfillment.shipped`, `fulfillment.delivered` |
| Notification | `notification.send`, `notification.sent`, `notification.failed` |

## Shared Utilities

### Error Handling

```typescript
import {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  ValidationError
} from '@core/modules'

// Throw typed errors
throw new NotFoundError('User not found')
throw new BadRequestError('Invalid input', { field: 'email' })
throw new UnauthorizedError('Invalid credentials')
throw new ConflictError('Email already exists')
throw new ValidationError('Validation failed', errors)
```

### Response Helpers

```typescript
import { sendSuccess, sendError, sendPaginated } from '@core/modules'

// Success response
sendSuccess(res, { id: '123', name: 'Product' })

// Paginated response
sendPaginated(res, products, total, { page: 1, limit: 10 })

// Error response
sendError(res, new NotFoundError('Not found'))
```

### Middleware

```typescript
import {
  validateBody,
  validateQuery,
  createAuthMiddleware,
  requirePermissions,
  errorHandler
} from '@core/modules'

// Validation
router.post('/products', validateBody(createProductSchema), controller.create)
router.get('/products', validateQuery(listProductsSchema), controller.list)

// Authentication
const auth = createAuthMiddleware({ verifyToken })
router.use(auth)

// Permissions
router.delete('/products/:id', requirePermissions(['products.delete']), controller.delete)

// Error handling
app.use(errorHandler())
```

## Database Utilities

```typescript
import { getDatabase, withTransaction, checkDatabaseHealth } from '@core/modules'

// Get shared Prisma instance
const prisma = getDatabase()

// Check database health
const isHealthy = await checkDatabaseHealth(prisma)

// Run operations in transaction
const result = await withTransaction(prisma, async (tx) => {
  const user = await tx.user.create({ data: userData })
  const cart = await tx.cart.create({ data: { userId: user.id } })
  return { user, cart }
})
```

## Project Structure

```
src/
├── index.ts                 # Main entry point, exports all modules
├── modules/
│   ├── users/
│   │   ├── index.ts         # Module exports
│   │   ├── types.ts         # TypeScript types
│   │   ├── validators.ts    # Zod schemas
│   │   ├── service.ts       # Business logic
│   │   ├── controller.ts    # HTTP handlers
│   │   ├── routes.ts        # Express routes
│   │   └── oauth/           # OAuth providers
│   ├── products/
│   │   └── ...
│   ├── orders/
│   │   └── ...
│   ├── payments/
│   │   ├── adapters/        # Payment provider adapters
│   │   └── ...
│   ├── cart/
│   │   └── ...
│   ├── fulfillment/
│   │   ├── adapters/        # Shipping provider adapters
│   │   └── ...
│   ├── discounts/
│   │   └── ...
│   ├── notifications/
│   │   ├── adapters/        # Notification channel adapters
│   │   └── ...
│   └── regions/
│       └── ...
└── shared/
    ├── errors/              # Error classes
    ├── events/              # Event bus
    ├── middleware/          # Express middleware
    ├── database/            # Prisma utilities
    ├── utils/               # Helper functions
    └── types/               # Shared types
```

## Configuration Reference

### CoreModulesConfig

```typescript
interface CoreModulesConfig {
  prisma: PrismaClient
  jwtSecret: string
  jwtExpiresIn?: string        // default: '1h'
  refreshSecret?: string
  refreshExpiresIn?: string    // default: '7d'
  basePath?: string            // default: '/api'
  modules?: {
    users?: boolean            // default: true
    products?: boolean         // default: true
    orders?: boolean           // default: true
    payments?: boolean         // default: true
    cart?: boolean             // default: true
    fulfillment?: boolean      // default: true
    discounts?: boolean        // default: true
    notifications?: boolean    // default: true
    regions?: boolean          // default: true
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run in development mode
npm run dev

# Database commands
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:push        # Push schema to database
npm run db:seed        # Seed database
```

## Testing

The project uses Vitest for testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Requirements

- Node.js >= 20.0.0
- PostgreSQL (or any Prisma-supported database)
- TypeScript 5.x

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
