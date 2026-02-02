// ============================================
// Shippo Shipping Adapter
// Supports: USPS, UPS, FedEx, DHL and more
// ============================================

import {
  ShippingAdapter,
  CreateLabelInput,
  GetRatesInput,
  ShippingRate,
  TrackingInfo,
  Address,
  Package,
} from '../types.js'

// ============================================
// Types
// ============================================

export interface ShippoConfig {
  apiKey: string
  /** Test mode (default: false) */
  testMode?: boolean
}

interface ShippoAddress {
  name: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
}

interface ShippoParcel {
  length: string
  width: string
  height: string
  distance_unit: string
  weight: string
  mass_unit: string
}

interface ShippoRate {
  object_id: string
  provider: string
  servicelevel: { name: string; token: string }
  amount: string
  currency: string
  estimated_days: number
}

interface ShippoTransaction {
  object_id: string
  tracking_number: string
  label_url: string
  tracking_url_provider: string
  rate: string
}

interface ShippoTrackingStatus {
  status: string
  substatus?: string
  status_details: string
  status_date: string
  location?: {
    city: string
    state: string
    country: string
  }
}

// ============================================
// Shippo Adapter Implementation
// ============================================

export class ShippoAdapter implements ShippingAdapter {
  name = 'shippo'
  private config: ShippoConfig
  private baseUrl = 'https://api.goshippo.com'

  constructor(config: ShippoConfig) {
    this.config = {
      testMode: false,
      ...config,
    }
  }

  /**
   * Create a shipping label
   */
  async createLabel(input: CreateLabelInput): Promise<{
    trackingNumber: string
    labelUrl: string
    transactionId?: string
  }> {
    // Create shipment
    const shipment = await this.createShipment(input)

    // Get the best rate (first one is usually cheapest)
    const rates = shipment.rates as ShippoRate[]
    if (!rates || rates.length === 0) {
      throw new Error('No shipping rates available for this shipment')
    }

    const selectedRate = rates[0]

    // Create transaction (purchase label)
    const transaction = await this.request<ShippoTransaction>('/transactions', {
      method: 'POST',
      body: {
        rate: selectedRate.object_id,
        label_file_type: 'PDF',
        async: false,
      },
    })

    return {
      trackingNumber: transaction.tracking_number,
      labelUrl: transaction.label_url,
      transactionId: transaction.object_id,
    }
  }

  /**
   * Get shipping rates
   */
  async getRates(input: GetRatesInput): Promise<ShippingRate[]> {
    const shipment = await this.createShipment(input)
    const rates = shipment.rates as ShippoRate[]

    return rates.map((rate) => ({
      provider: rate.provider,
      service: rate.servicelevel.name,
      rate: parseFloat(rate.amount),
      currency: rate.currency,
      estimatedDays: rate.estimated_days,
      rateId: rate.object_id,
    }))
  }

  /**
   * Track a shipment
   */
  async trackShipment(trackingNumber: string, carrier?: string): Promise<TrackingInfo> {
    const response = await this.request<{
      tracking_status: ShippoTrackingStatus
      tracking_history: ShippoTrackingStatus[]
    }>(`/tracks/${carrier || 'shippo'}/${trackingNumber}`, {
      method: 'GET',
    })

    return {
      status: this.mapStatus(response.tracking_status?.status || 'UNKNOWN'),
      events: (response.tracking_history || []).map((event) => ({
        timestamp: new Date(event.status_date),
        description: event.status_details,
        location: event.location
          ? `${event.location.city}, ${event.location.state}, ${event.location.country}`
          : undefined,
      })),
    }
  }

  /**
   * Cancel/refund a shipping label
   */
  async cancelLabel(transactionId: string): Promise<boolean> {
    try {
      await this.request(`/refunds`, {
        method: 'POST',
        body: {
          transaction: transactionId,
        },
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Validate an address
   */
  async validateAddress(address: Address): Promise<{
    isValid: boolean
    messages: string[]
  }> {
    const response = await this.request<{
      validation_results: {
        is_valid: boolean
        messages: { text: string }[]
      }
    }>('/addresses', {
      method: 'POST',
      body: {
        ...this.formatAddress(address),
        validate: true,
      },
    })

    return {
      isValid: response.validation_results?.is_valid || false,
      messages: response.validation_results?.messages?.map((m) => m.text) || [],
    }
  }

  /**
   * Get available carriers
   */
  async getCarriers(): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const response = await this.request<{
      results: { object_id: string; carrier: string; active: boolean }[]
    }>('/carrier_accounts', {
      method: 'GET',
    })

    return response.results.map((carrier) => ({
      id: carrier.object_id,
      name: carrier.carrier,
      isActive: carrier.active,
    }))
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async createShipment(input: CreateLabelInput | GetRatesInput): Promise<{
    object_id: string
    rates: ShippoRate[]
  }> {
    return this.request('/shipments', {
      method: 'POST',
      body: {
        address_from: this.formatAddress(input.fromAddress),
        address_to: this.formatAddress(input.toAddress),
        parcels: input.packages.map((pkg) => this.formatParcel(pkg)),
        async: false,
      },
    })
  }

  private formatAddress(address: Address): ShippoAddress {
    return {
      name: address.name,
      street1: address.address1,
      street2: address.address2,
      city: address.city,
      state: address.state || '',
      zip: address.postalCode,
      country: address.country,
    }
  }

  private formatParcel(pkg: Package): ShippoParcel {
    return {
      length: String(pkg.length || 10),
      width: String(pkg.width || 10),
      height: String(pkg.height || 10),
      distance_unit: 'in',
      weight: String(pkg.weight),
      mass_unit: 'lb',
    }
  }

  private mapStatus(shippoStatus: string): string {
    const statusMap: Record<string, string> = {
      PRE_TRANSIT: 'pending',
      TRANSIT: 'in_transit',
      DELIVERED: 'delivered',
      RETURNED: 'returned',
      FAILURE: 'failed',
      UNKNOWN: 'unknown',
    }
    return statusMap[shippoStatus] || 'unknown'
  }

  private async request<T>(
    endpoint: string,
    options: { method: string; body?: Record<string, unknown> }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `ShippoToken ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Shippo API error: ${JSON.stringify(data)}`)
    }

    return data as T
  }
}

// ============================================
// Factory Function
// ============================================

export function createShippoAdapter(config: ShippoConfig): ShippoAdapter {
  return new ShippoAdapter(config)
}
