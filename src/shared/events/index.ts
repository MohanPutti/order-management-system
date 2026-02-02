import { EventEmitter } from 'events'

/**
 * Type-safe event emitter for inter-module communication
 */

// ============================================
// Event Definitions - Add events here as modules grow
// ============================================

export interface CoreEvents {
  // User events
  'user.created': { userId: string; email: string }
  'user.updated': { userId: string; changes: Record<string, unknown> }
  'user.deleted': { userId: string }
  'user.login': { userId: string; timestamp: Date }
  'user.logout': { userId: string; timestamp: Date }
  'user.passwordChanged': { userId: string }
  'user.passwordResetRequested': { userId: string; email: string }

  // Role events
  'role.created': { roleId: string; name: string }
  'role.updated': { roleId: string; changes: Record<string, unknown> }
  'role.deleted': { roleId: string }

  // Order events
  'order.created': { orderId: string; userId: string; total: number }
  'order.updated': { orderId: string; status: string }
  'order.cancelled': { orderId: string; reason?: string }
  'order.completed': { orderId: string }
  'order.refunded': { orderId: string; amount: number }

  // Payment events
  'payment.initiated': { paymentId: string; orderId: string; amount: number }
  'payment.completed': { paymentId: string; orderId: string }
  'payment.failed': { paymentId: string; orderId: string; reason: string }
  'payment.refunded': { paymentId: string; amount: number }

  // Product events
  'product.created': { productId: string; name: string }
  'product.updated': { productId: string; changes: Record<string, unknown> }
  'product.deleted': { productId: string }
  'product.stockUpdated': { productId: string; quantity: number }

  // Cart events
  'cart.created': { cartId: string; userId?: string }
  'cart.itemAdded': { cartId: string; productId: string; quantity: number }
  'cart.itemRemoved': { cartId: string; productId: string }
  'cart.cleared': { cartId: string }
  'cart.converted': { cartId: string; orderId: string }

  // Fulfillment events
  'fulfillment.created': { fulfillmentId: string; orderId: string }
  'fulfillment.shipped': { fulfillmentId: string; trackingNumber: string }
  'fulfillment.delivered': { fulfillmentId: string }

  // Notification events
  'notification.send': { type: string; recipient: string; data: Record<string, unknown> }
  'notification.sent': { notificationId: string }
  'notification.failed': { notificationId: string; error: string }

  // Generic events
  'module.initialized': { moduleName: string }
  'module.error': { moduleName: string; error: Error }
}

// ============================================
// Event Bus Implementation
// ============================================

type EventKey = keyof CoreEvents
type EventPayload<K extends EventKey> = CoreEvents[K]
type EventHandler<K extends EventKey> = (payload: EventPayload<K>) => void | Promise<void>

class TypedEventEmitter {
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100) // Allow many listeners
  }

  /**
   * Subscribe to an event
   */
  on<K extends EventKey>(event: K, handler: EventHandler<K>): this {
    this.emitter.on(event, handler as (...args: unknown[]) => void)
    return this
  }

  /**
   * Subscribe to an event (once)
   */
  once<K extends EventKey>(event: K, handler: EventHandler<K>): this {
    this.emitter.once(event, handler as (...args: unknown[]) => void)
    return this
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends EventKey>(event: K, handler: EventHandler<K>): this {
    this.emitter.off(event, handler as (...args: unknown[]) => void)
    return this
  }

  /**
   * Emit an event
   */
  emit<K extends EventKey>(event: K, payload: EventPayload<K>): boolean {
    return this.emitter.emit(event, payload)
  }

  /**
   * Emit an event and wait for all async handlers
   */
  async emitAsync<K extends EventKey>(event: K, payload: EventPayload<K>): Promise<void> {
    const listeners = this.emitter.listeners(event)
    await Promise.all(
      listeners.map((listener) => Promise.resolve(listener(payload)))
    )
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends EventKey>(event: K): number {
    return this.emitter.listenerCount(event)
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners<K extends EventKey>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event)
    } else {
      this.emitter.removeAllListeners()
    }
    return this
  }
}

// ============================================
// Singleton Event Bus
// ============================================

let eventBusInstance: TypedEventEmitter | null = null

/**
 * Get the shared event bus instance
 */
export function getEventBus(): TypedEventEmitter {
  if (!eventBusInstance) {
    eventBusInstance = new TypedEventEmitter()
  }
  return eventBusInstance
}

/**
 * Create a new isolated event bus (for testing or isolation)
 */
export function createEventBus(): TypedEventEmitter {
  return new TypedEventEmitter()
}

/**
 * Reset the shared event bus (useful for testing)
 */
export function resetEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.removeAllListeners()
    eventBusInstance = null
  }
}

export { TypedEventEmitter }
