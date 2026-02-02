// ============================================
// Fulfillment Adapters - Public API
// ============================================

// Shippo Adapter (International: USPS, UPS, FedEx, DHL)
export { ShippoAdapter, createShippoAdapter, ShippoConfig } from './shippo.js'

// Delhivery Adapter (India)
export { DelhiveryAdapter, createDelhiveryAdapter, DelhiveryConfig } from './delhivery.js'

// Shiprocket Adapter (India - Multi-courier aggregator)
export { ShiprocketAdapter, createShiprocketAdapter, ShiprocketConfig } from './shiprocket.js'

// ============================================
// Adapter Factory
// ============================================

import { ShippingAdapter } from '../types.js'
import { ShippoAdapter, ShippoConfig } from './shippo.js'
import { DelhiveryAdapter, DelhiveryConfig } from './delhivery.js'
import { ShiprocketAdapter, ShiprocketConfig } from './shiprocket.js'

export type ShippingAdapterType = 'shippo' | 'delhivery' | 'shiprocket'

export interface ShippingAdapterConfigs {
  shippo?: ShippoConfig
  delhivery?: DelhiveryConfig
  shiprocket?: ShiprocketConfig
}

/**
 * Create shipping adapters from configuration
 *
 * @example
 * ```typescript
 * const adapters = createShippingAdapters({
 *   shippo: {
 *     apiKey: process.env.SHIPPO_API_KEY!,
 *   },
 *   delhivery: {
 *     apiToken: process.env.DELHIVERY_API_TOKEN!,
 *     clientName: process.env.DELHIVERY_CLIENT_NAME!,
 *     pickupLocation: 'Main Warehouse',
 *   },
 *   shiprocket: {
 *     email: process.env.SHIPROCKET_EMAIL!,
 *     password: process.env.SHIPROCKET_PASSWORD!,
 *   },
 * })
 * ```
 */
export function createShippingAdapters(
  configs: ShippingAdapterConfigs
): Record<string, ShippingAdapter> {
  const adapters: Record<string, ShippingAdapter> = {}

  if (configs.shippo) {
    adapters.shippo = new ShippoAdapter(configs.shippo)
  }

  if (configs.delhivery) {
    adapters.delhivery = new DelhiveryAdapter(configs.delhivery)
  }

  if (configs.shiprocket) {
    adapters.shiprocket = new ShiprocketAdapter(configs.shiprocket)
  }

  return adapters
}

/**
 * Get a specific adapter by name
 */
export function getShippingAdapter(
  adapters: Record<string, ShippingAdapter>,
  name: ShippingAdapterType
): ShippingAdapter | undefined {
  return adapters[name]
}
