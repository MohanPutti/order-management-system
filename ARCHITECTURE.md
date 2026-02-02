# Core Modules Architecture

## Vision
Build independent, plug-and-play core modules using simple Node.js stack. Each module is self-contained with REST APIs and can work standalone or together.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20+ |
| **Language** | TypeScript 5 |
| **API Framework** | Express.js (simple, widely adopted) |
| **Database ORM** | Prisma (type-safe, MySQL only) |
| **Validation** | Zod |
| **Authentication** | JWT + bcrypt |
| **API Documentation** | OpenAPI/Swagger |
| **Testing** | Vitest |

---

## Core Modules

### 1. **User Management** (`@core/users`)
- Authentication (email/password, OAuth, API keys)
- Authorization (roles, permissions)
- User profiles
- Session/token management
- Teams/Organizations (optional)

### 2. **Order Management** (`@core/orders`)
- Order lifecycle
- Line items
- Status tracking
- Order events/history
- Returns workflow

### 3. **Payment Management** (`@core/payments`)
- Payment provider adapters
- Transactions (capture, refund, cancel)
- Payment webhooks
- Multi-currency

### 4. **Fulfillment Management** (`@core/fulfillment`)
- Shipping provider adapters
- Labels & tracking
- Rate calculation
- Address validation

### 5. **Product Management** (`@core/products`)
- Products & variants
- Categories & collections
- Inventory
- Pricing

### 6. **Cart Management** (`@core/cart`)
- Cart operations
- Line items
- Cart → Order conversion

### 7. **Discount Management** (`@core/discounts`)
- Discount rules
- Coupon codes
- Conditions & limits

### 8. **Notification Management** (`@core/notifications`)
- Email sending
- Webhooks
- Templates

### 9. **Region Management** (`@core/regions`)
- Countries & regions
- Currencies
- Tax rates

### 10. **Admin Dashboard** (`@core/admin-ui`)
- React components
- Data tables
- Forms

---

## Module Structure

Each module follows the same structure:

```
@core/[module-name]/
├── src/
│   ├── models/              # Prisma models & types
│   │   ├── schema.prisma    # Module's Prisma schema
│   │   └── types.ts         # TypeScript types
│   ├── routes/              # Express routes (REST API)
│   │   ├── index.ts
│   │   └── [resource].routes.ts
│   ├── controllers/         # Request handlers
│   │   └── [resource].controller.ts
│   ├── services/            # Business logic
│   │   └── [resource].service.ts
│   ├── adapters/            # External integrations (optional)
│   │   ├── types.ts
│   │   └── [provider].adapter.ts
│   ├── middleware/          # Express middleware
│   │   └── index.ts
│   ├── validators/          # Zod schemas
│   │   └── [resource].validator.ts
│   ├── events/              # Event emitters
│   │   └── index.ts
│   ├── config/              # Module configuration
│   │   └── index.ts
│   ├── utils/               # Helper functions
│   │   └── index.ts
│   └── index.ts             # Public API export
├── prisma/
│   └── schema.prisma        # Database schema
├── package.json
├── tsconfig.json
└── README.md
```

---

## Integration Patterns

### 1. As Express Router (Plug into existing app)
```typescript
import express from 'express'
import { createUserRouter } from '@core/users'
import { createOrderRouter } from '@core/orders'

const app = express()

// Plug in modules as routers
app.use('/api/users', createUserRouter({
  prisma: prismaClient,
  config: { /* module config */ }
}))

app.use('/api/orders', createOrderRouter({
  prisma: prismaClient,
  config: { /* module config */ }
}))
```

### 2. As Standalone Service
```typescript
import { createUserService } from '@core/users'

const userService = createUserService({
  prisma: prismaClient,
  config: {
    jwt: { secret: 'xxx', expiresIn: '7d' },
    password: { minLength: 8 }
  }
})

// Use service directly
const user = await userService.createUser({ email, password })
const token = await userService.login({ email, password })
```

### 3. Event-Driven Communication
```typescript
import { EventEmitter } from 'events'

// Shared event bus
const eventBus = new EventEmitter()

// User module emits events
userService.on('user.created', (user) => {
  eventBus.emit('user.created', user)
})

// Order module listens
eventBus.on('user.created', async (user) => {
  // Send welcome email, create default cart, etc.
})
```

### 4. Service Injection
```typescript
// Order module can use User module's service
import { createOrderRouter } from '@core/orders'
import { createUserService } from '@core/users'

const userService = createUserService({ prisma })
const orderRouter = createOrderRouter({
  prisma,
  services: {
    users: userService  // Inject user service
  }
})
```

---

## Database Strategy

### Option A: Shared Database (Recommended for most cases)
All modules share one database, each module adds its tables.

```typescript
// Merge all Prisma schemas
// prisma/schema.prisma (combined)
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")  // mysql://user:password@localhost:3306/dbname
}

// User module tables
model User { ... }
model Role { ... }

// Order module tables
model Order { ... }
model OrderItem { ... }

// Payment module tables
model Payment { ... }
```

### Option B: Separate Databases (Microservices)
Each module has its own database, communicate via events/API.

```typescript
// User module: users_db
// Order module: orders_db (stores userId reference only)
// Communication via REST API or events
```

---

## Configuration Pattern

Each module accepts configuration on initialization:

```typescript
interface UserModuleConfig {
  // Database
  prisma: PrismaClient

  // Authentication
  jwt: {
    secret: string
    expiresIn: string
    refreshExpiresIn?: string
  }

  // Password rules
  password: {
    minLength: number
    requireNumbers?: boolean
    requireSpecialChars?: boolean
  }

  // Features toggle
  features?: {
    registration?: boolean
    passwordReset?: boolean
    apiKeys?: boolean
    teams?: boolean
    oauth?: boolean
  }

  // Hooks for customization
  hooks?: {
    beforeCreate?: (data: CreateUserInput) => Promise<CreateUserInput>
    afterCreate?: (user: User) => Promise<void>
    beforeLogin?: (email: string) => Promise<void>
    afterLogin?: (user: User) => Promise<void>
  }

  // Event emitter for integration
  eventBus?: EventEmitter
}
```

---

## REST API Design

Each module exposes standard REST endpoints:

### User Module API
```
POST   /auth/register        - Register new user
POST   /auth/login           - Login, get tokens
POST   /auth/refresh         - Refresh access token
POST   /auth/logout          - Logout
POST   /auth/forgot-password - Request password reset
POST   /auth/reset-password  - Reset password

GET    /users                - List users (admin)
GET    /users/:id            - Get user
PUT    /users/:id            - Update user
DELETE /users/:id            - Delete user
GET    /users/me             - Get current user
PUT    /users/me             - Update current user

GET    /roles                - List roles
POST   /roles                - Create role
PUT    /roles/:id            - Update role
DELETE /roles/:id            - Delete role
```

### Order Module API
```
GET    /orders               - List orders
POST   /orders               - Create order
GET    /orders/:id           - Get order
PUT    /orders/:id           - Update order
DELETE /orders/:id           - Cancel order

POST   /orders/:id/items     - Add item
PUT    /orders/:id/items/:itemId - Update item
DELETE /orders/:id/items/:itemId - Remove item

POST   /orders/:id/fulfill   - Mark as fulfilled
POST   /orders/:id/cancel    - Cancel order
POST   /orders/:id/refund    - Refund order
```

---

## File Structure (Monorepo)

```
core-modules/
├── packages/
│   ├── shared/                  # Shared utilities
│   │   ├── src/
│   │   │   ├── types/           # Common types
│   │   │   ├── utils/           # Helper functions
│   │   │   ├── middleware/      # Common middleware
│   │   │   └── events/          # Event definitions
│   │   └── package.json
│   │
│   ├── users/                   # User management
│   ├── orders/                  # Order management
│   ├── payments/                # Payment management
│   ├── fulfillment/             # Fulfillment management
│   ├── products/                # Product management
│   ├── cart/                    # Cart management
│   ├── discounts/               # Discount management
│   ├── notifications/           # Notification management
│   ├── regions/                 # Region management
│   └── admin-ui/                # Admin UI components
│
├── apps/
│   └── example/                 # Example app using modules
│       ├── src/
│       │   ├── index.ts         # Main entry
│       │   └── prisma/
│       │       └── schema.prisma # Combined schema
│       └── package.json
│
├── package.json                 # Workspace root
├── pnpm-workspace.yaml          # PNPM workspaces
├── tsconfig.base.json           # Shared TS config
└── ARCHITECTURE.md
```

---

## Development Phases

### Phase 1: Foundation
1. ✅ Set up monorepo with pnpm workspaces
2. Create shared package (types, utils, middleware)
3. Build **User Management Module**

### Phase 2: Core Commerce
4. Build **Product Management Module**
5. Build **Cart Management Module**
6. Build **Region Management Module**

### Phase 3: Transactions
7. Build **Order Management Module**
8. Build **Payment Management Module**
9. Build **Discount Management Module**

### Phase 4: Fulfillment & Communication
10. Build **Fulfillment Management Module**
11. Build **Notification Management Module**

### Phase 5: Admin & Polish
12. Build **Admin Dashboard Module**
13. Create example application
14. Documentation

---

## Next Steps

1. Initialize monorepo with pnpm
2. Create shared package
3. Start with User Management Module
