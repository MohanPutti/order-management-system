// ============================================
// Delhivery Shipping Adapter (India)
// Supports: Express, Surface, Same-day delivery
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

export interface DelhiveryConfig {
  apiToken: string
  /** Client name provided by Delhivery */
  clientName: string
  /** Pickup location name */
  pickupLocation: string
  /** Test mode (default: false) */
  testMode?: boolean
}

interface DelhiveryWaybillResponse {
  cash_pickups_count: number
  package_count: number
  upload_wbn: string
  replacement_count: number
  pickups_count: number
  packages: {
    remarks: string[]
    waybill: string
    cod_amount: number
    payment: string
    status: string
    refnum: string
  }[]
  cod_amount: number
  success: boolean
  cod_count: number
  prepaid_count: number
}

interface DelhiveryTrackingResponse {
  ShipmentData: {
    Shipment: {
      Status: {
        Status: string
        StatusDateTime: string
        StatusLocation: string
        Instructions: string
      }
      Scans: {
        ScanDetail: {
          Scan: string
          ScanDateTime: string
          ScannedLocation: string
          Instructions: string
        }
      }[]
      Destination: string
      DestRecievedBy: string
      PickUpDate: string
      DeliveryDate: string
      ObjectState: string
      ReferenceNo: string
    }
  }[]
}

interface DelhiveryPincodeResponse {
  delivery_codes: {
    postal_code: {
      pin: string
      pre_paid: string
      cash: string
      pickup: string
      repl: string
      cod: string
      district: string
      state_code: string
    }
  }[]
}

// ============================================
// Delhivery Adapter Implementation
// ============================================

export class DelhiveryAdapter implements ShippingAdapter {
  name = 'delhivery'
  private config: DelhiveryConfig
  private baseUrl: string

  constructor(config: DelhiveryConfig) {
    this.config = {
      testMode: false,
      ...config,
    }
    this.baseUrl = this.config.testMode
      ? 'https://staging-express.delhivery.com'
      : 'https://track.delhivery.com'
  }

  /**
   * Create a shipping label / waybill
   */
  async createLabel(input: CreateLabelInput & {
    orderId: string
    paymentMode?: 'Prepaid' | 'COD'
    codAmount?: number
    productDescription?: string
  }): Promise<{
    trackingNumber: string
    labelUrl: string
  }> {
    const shipmentData = this.formatShipmentData(input)

    const formData = new URLSearchParams()
    formData.append('format', 'json')
    formData.append('data', JSON.stringify({ shipments: [shipmentData] }))

    const response = await this.request<DelhiveryWaybillResponse>(
      '/api/cmu/create.json',
      {
        method: 'POST',
        body: formData.toString(),
        contentType: 'application/x-www-form-urlencoded',
      }
    )

    if (!response.success || !response.packages?.[0]?.waybill) {
      const error = response.packages?.[0]?.remarks?.join(', ') || 'Failed to create shipment'
      throw new Error(`Delhivery API error: ${error}`)
    }

    const waybill = response.packages[0].waybill

    return {
      trackingNumber: waybill,
      labelUrl: `${this.baseUrl}/api/p/packing_slip?wbns=${waybill}&pdf=true`,
    }
  }

  /**
   * Get shipping rates
   */
  async getRates(input: GetRatesInput): Promise<ShippingRate[]> {
    // Delhivery doesn't have a public rates API
    // Calculate based on weight and zones
    const totalWeight = input.packages.reduce((sum, pkg) => sum + pkg.weight, 0)

    // Check serviceability first
    const isServiceable = await this.checkServiceability(
      input.fromAddress.postalCode,
      input.toAddress.postalCode
    )

    if (!isServiceable.prepaid && !isServiceable.cod) {
      return []
    }

    const rates: ShippingRate[] = []

    // Express delivery (1-3 days)
    if (isServiceable.prepaid) {
      rates.push({
        provider: 'delhivery',
        service: 'Express',
        rate: this.calculateRate(totalWeight, 'express'),
        currency: 'INR',
        estimatedDays: 2,
      })
    }

    // Surface delivery (5-7 days)
    if (isServiceable.prepaid) {
      rates.push({
        provider: 'delhivery',
        service: 'Surface',
        rate: this.calculateRate(totalWeight, 'surface'),
        currency: 'INR',
        estimatedDays: 6,
      })
    }

    return rates
  }

  /**
   * Track a shipment
   */
  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const response = await this.request<DelhiveryTrackingResponse>(
      `/api/v1/packages/json/?waybill=${trackingNumber}`,
      { method: 'GET' }
    )

    const shipment = response.ShipmentData?.[0]?.Shipment
    if (!shipment) {
      throw new Error('Shipment not found')
    }

    const events = shipment.Scans?.map((scan) => ({
      timestamp: new Date(scan.ScanDetail.ScanDateTime),
      description: scan.ScanDetail.Instructions || scan.ScanDetail.Scan,
      location: scan.ScanDetail.ScannedLocation,
    })) || []

    return {
      status: this.mapStatus(shipment.Status?.Status || 'Unknown'),
      events,
    }
  }

  /**
   * Cancel a shipment
   */
  async cancelLabel(trackingNumber: string): Promise<boolean> {
    try {
      const formData = new URLSearchParams()
      formData.append('waybill', trackingNumber)
      formData.append('cancellation', 'true')

      await this.request('/api/p/edit', {
        method: 'POST',
        body: formData.toString(),
        contentType: 'application/x-www-form-urlencoded',
      })

      return true
    } catch {
      return false
    }
  }

  /**
   * Check if delivery is available for given pincodes
   */
  async checkServiceability(
    originPincode: string,
    destinationPincode: string
  ): Promise<{
    prepaid: boolean
    cod: boolean
    pickup: boolean
  }> {
    const response = await this.request<DelhiveryPincodeResponse>(
      `/c/api/pin-codes/json/?filter_codes=${destinationPincode}`,
      { method: 'GET' }
    )

    const pinData = response.delivery_codes?.[0]?.postal_code
    if (!pinData) {
      return { prepaid: false, cod: false, pickup: false }
    }

    return {
      prepaid: pinData.pre_paid === 'Y',
      cod: pinData.cod === 'Y',
      pickup: pinData.pickup === 'Y',
    }
  }

  /**
   * Get pickup locations
   */
  async getPickupLocations(): Promise<{
    name: string
    address: string
    pincode: string
  }[]> {
    const response = await this.request<{
      data: { name: string; add: string; pin: string }[]
    }>('/api/backend/clientwarehouse/', { method: 'GET' })

    return response.data.map((loc) => ({
      name: loc.name,
      address: loc.add,
      pincode: loc.pin,
    }))
  }

  /**
   * Request a pickup
   */
  async requestPickup(params: {
    pickupDate: Date
    pickupTime: string // "10:00-12:00"
    expectedPackages: number
  }): Promise<{ pickupId: string }> {
    const formData = new URLSearchParams()
    formData.append('pickup_location', this.config.pickupLocation)
    formData.append('pickup_date', params.pickupDate.toISOString().split('T')[0])
    formData.append('pickup_time', params.pickupTime)
    formData.append('expected_package_count', String(params.expectedPackages))

    const response = await this.request<{ pickup_id: string }>(
      '/fm/request/new/',
      {
        method: 'POST',
        body: formData.toString(),
        contentType: 'application/x-www-form-urlencoded',
      }
    )

    return { pickupId: response.pickup_id }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private formatShipmentData(input: CreateLabelInput & {
    orderId: string
    paymentMode?: 'Prepaid' | 'COD'
    codAmount?: number
    productDescription?: string
  }): Record<string, unknown> {
    const totalWeight = input.packages.reduce((sum, pkg) => sum + pkg.weight, 0)

    return {
      name: input.toAddress.name,
      add: input.toAddress.address1,
      pin: input.toAddress.postalCode,
      city: input.toAddress.city,
      state: input.toAddress.state || '',
      country: input.toAddress.country,
      phone: '', // Should be passed in address
      order: input.orderId,
      payment_mode: input.paymentMode || 'Prepaid',
      cod_amount: input.codAmount || 0,
      weight: totalWeight * 1000, // Convert to grams
      shipment_width: input.packages[0]?.width || 10,
      shipment_height: input.packages[0]?.height || 10,
      shipment_length: input.packages[0]?.length || 10,
      product_desc: input.productDescription || 'Package',
      hsn_code: '',
      seller_name: input.fromAddress.name,
      seller_add: input.fromAddress.address1,
      seller_cst: '',
      seller_tin: '',
      consignee_gst_tin: '',
      integrated_gst_amount: 0,
      return_name: input.fromAddress.name,
      return_add: input.fromAddress.address1,
      return_pin: input.fromAddress.postalCode,
      return_city: input.fromAddress.city,
      return_state: input.fromAddress.state || '',
      return_country: input.fromAddress.country,
      return_phone: '',
      client: this.config.clientName,
      pickup_location: {
        name: this.config.pickupLocation,
      },
    }
  }

  private calculateRate(weightKg: number, service: 'express' | 'surface'): number {
    // Base rates (approximate, actual rates vary by contract)
    const baseRates = {
      express: { base: 45, perKg: 25 },
      surface: { base: 30, perKg: 15 },
    }

    const rate = baseRates[service]
    const chargeableWeight = Math.max(0.5, Math.ceil(weightKg * 2) / 2) // Round up to 0.5kg

    return rate.base + (chargeableWeight - 0.5) * rate.perKg
  }

  private mapStatus(delhiveryStatus: string): string {
    const statusMap: Record<string, string> = {
      Manifested: 'pending',
      'In Transit': 'in_transit',
      'Out For Delivery': 'in_transit',
      Delivered: 'delivered',
      RTO: 'returned',
      Pending: 'pending',
      Dispatched: 'shipped',
    }
    return statusMap[delhiveryStatus] || 'unknown'
  }

  private async request<T>(
    endpoint: string,
    options: {
      method: string
      body?: string
      contentType?: string
    }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Token ${this.config.apiToken}`,
      'Content-Type': options.contentType || 'application/json',
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method,
      headers,
      body: options.body,
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Delhivery API error: ${JSON.stringify(data)}`)
    }

    return data as T
  }
}

// ============================================
// Factory Function
// ============================================

export function createDelhiveryAdapter(config: DelhiveryConfig): DelhiveryAdapter {
  return new DelhiveryAdapter(config)
}
