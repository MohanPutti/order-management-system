// ============================================
// Shiprocket Shipping Adapter
// India shipping aggregator with 17+ courier partners
// ============================================

import { ShippingAdapter, ShippingLabel, ShippingRate, TrackingInfo, ShipmentAddress } from '../types.js'

// ============================================
// Types
// ============================================

export interface ShiprocketConfig {
  email: string
  password: string
  /** Base URL (default: https://apiv2.shiprocket.in/v1/external) */
  baseUrl?: string
}

export interface ShiprocketTokenResponse {
  token: string
  created_at: string
  expires_at: string
}

export interface ShiprocketOrder {
  order_id: string
  channel_order_id: string
  shipment_id: string
  status: string
  status_code: number
  onboarding_completed_now: boolean
  awb_code: string
  courier_company_id: string
  courier_name: string
}

export interface ShiprocketShipment {
  id: number
  order_id: number
  shipment_status: string
  status_code: string
  awb_code: string
  courier_company_id: number
  courier_name: string
  pickup_scheduled_date: string
  delivered_date: string | null
  etd: string
}

export interface ShiprocketCourier {
  courier_company_id: number
  courier_name: string
  freight_charge: number
  cod_charges: number
  coverage_charges: number
  rto_charges: number
  estimated_delivery_days: string
  rate: number
  cod: number
  min_weight: number
  etd: string
  etd_hours: number
  rating: number
  suppress_date: string | null
}

export interface ShiprocketTrackingActivity {
  date: string
  status: string
  activity: string
  location: string
  sr_status: string
  sr_status_label: string
}

export interface ShiprocketTrackingResponse {
  tracking_data: {
    track_status: number
    shipment_status: number
    shipment_track: Array<{
      id: number
      awb_code: string
      courier_company_id: number
      courier_name: string
      current_status: string
      delivered_date: string | null
      edd: string | null
      pod: string | null
      pod_status: string;
    }>
    shipment_track_activities: ShiprocketTrackingActivity[]
    track_url: string
    etd: string
  }
}

export interface ShiprocketPickupLocation {
  id: number
  pickup_location: string
  name: string
  email: string
  phone: string
  address: string
  address_2: string
  city: string
  state: string
  country: string
  pin_code: string
  lat: string | null
  long: string | null
  status: number
  company_id: number
}

// ============================================
// Shiprocket Adapter
// ============================================

export class ShiprocketAdapter implements ShippingAdapter {
  name = 'shiprocket'

  private config: ShiprocketConfig
  private baseUrl: string
  private token: string | null = null
  private tokenExpiry: Date | null = null

  constructor(config: ShiprocketConfig) {
    this.config = config
    this.baseUrl = config.baseUrl || 'https://apiv2.shiprocket.in/v1/external'
  }

  /**
   * Get authentication token (auto-refreshes if expired)
   */
  private async getToken(): Promise<string> {
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token
    }

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: this.config.email,
        password: this.config.password,
      }),
    })

    if (!response.ok) {
      throw new Error(`Shiprocket authentication failed: ${response.statusText}`)
    }

    const data = await response.json() as ShiprocketTokenResponse
    this.token = data.token
    // Token is valid for 10 days, refresh after 9 days
    this.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000)

    return this.token
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken()

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string }
      throw new Error(`Shiprocket API error: ${error.message || response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Create a shipping label (order + shipment)
   */
  async createLabel(input: {
    fromAddress: ShipmentAddress
    toAddress: ShipmentAddress
    parcels: Array<{
      weight: number
      length?: number
      width?: number
      height?: number
    }>
    orderId: string
    orderItems: Array<{
      name: string
      sku: string
      units: number
      selling_price: number
      hsn?: string
    }>
    paymentMethod?: 'prepaid' | 'cod'
    subTotal: number
    courierId?: number
  }): Promise<ShippingLabel> {
    // Step 1: Create order
    const orderPayload = {
      order_id: input.orderId,
      order_date: new Date().toISOString().split('T')[0],
      pickup_location: input.fromAddress.company || 'Primary',
      billing_customer_name: `${input.toAddress.firstName} ${input.toAddress.lastName}`.trim(),
      billing_last_name: input.toAddress.lastName || '',
      billing_address: input.toAddress.street1,
      billing_address_2: input.toAddress.street2 || '',
      billing_city: input.toAddress.city,
      billing_pincode: input.toAddress.postalCode,
      billing_state: input.toAddress.state,
      billing_country: input.toAddress.country,
      billing_email: input.toAddress.email || '',
      billing_phone: input.toAddress.phone,
      shipping_is_billing: true,
      order_items: input.orderItems,
      payment_method: input.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
      sub_total: input.subTotal,
      length: input.parcels[0]?.length || 10,
      breadth: input.parcels[0]?.width || 10,
      height: input.parcels[0]?.height || 10,
      weight: input.parcels[0]?.weight || 0.5,
    }

    const orderResponse = await this.request<{
      order_id: number
      shipment_id: number
      status: string
      status_code: number
      channel_order_id: string
    }>('/orders/create/adhoc', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    })

    // Step 2: Generate AWB (assign courier)
    const awbPayload = {
      shipment_id: orderResponse.shipment_id,
      ...(input.courierId && { courier_id: input.courierId }),
    }

    const awbResponse = await this.request<{
      response: {
        data: {
          awb_code: string
          courier_company_id: number
          courier_name: string
          shipment_id: number
          order_id: number
          assigned_date_time: {
            date: string
          }
        }
      }
    }>('/courier/assign/awb', {
      method: 'POST',
      body: JSON.stringify(awbPayload),
    })

    // Step 3: Generate label
    const labelResponse = await this.request<{
      label_url: string
      response: string
    }>('/courier/generate/label', {
      method: 'POST',
      body: JSON.stringify({
        shipment_id: [orderResponse.shipment_id],
      }),
    })

    return {
      labelId: orderResponse.shipment_id.toString(),
      trackingNumber: awbResponse.response.data.awb_code,
      labelUrl: labelResponse.label_url,
      carrier: awbResponse.response.data.courier_name,
      carrierId: awbResponse.response.data.courier_company_id.toString(),
      estimatedDelivery: undefined,
      metadata: {
        orderId: orderResponse.order_id,
        shipmentId: orderResponse.shipment_id,
        channelOrderId: orderResponse.channel_order_id,
      },
    }
  }

  /**
   * Get shipping rates from multiple couriers
   */
  async getRates(input: {
    fromAddress: ShipmentAddress
    toAddress: ShipmentAddress
    parcels: Array<{
      weight: number
      length?: number
      width?: number
      height?: number
    }>
    cod?: boolean
  }): Promise<ShippingRate[]> {
    const response = await this.request<{
      data: {
        available_courier_companies: ShiprocketCourier[]
        recommended_courier_company_id: number
        shiprocket_recommended_courier_id: number
      }
    }>('/courier/serviceability/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pickup_postcode: input.fromAddress.postalCode,
        delivery_postcode: input.toAddress.postalCode,
        weight: input.parcels[0]?.weight || 0.5,
        length: input.parcels[0]?.length || 10,
        breadth: input.parcels[0]?.width || 10,
        height: input.parcels[0]?.height || 10,
        cod: input.cod ? 1 : 0,
      }),
    })

    return response.data.available_courier_companies.map((courier) => ({
      rateId: courier.courier_company_id.toString(),
      carrier: courier.courier_name,
      service: courier.courier_name,
      price: courier.rate,
      currency: 'INR',
      estimatedDays: parseInt(courier.estimated_delivery_days) || undefined,
      estimatedDelivery: courier.etd,
      metadata: {
        courierId: courier.courier_company_id,
        freightCharge: courier.freight_charge,
        codCharges: courier.cod_charges,
        rtoCharges: courier.rto_charges,
        rating: courier.rating,
        codAvailable: courier.cod === 1,
        isRecommended: courier.courier_company_id === response.data.recommended_courier_company_id,
      },
    }))
  }

  /**
   * Track a shipment
   */
  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const response = await this.request<ShiprocketTrackingResponse>(
      `/courier/track/awb/${trackingNumber}`
    )

    const trackData = response.tracking_data
    const shipment = trackData.shipment_track[0]
    const activities = trackData.shipment_track_activities || []

    // Map Shiprocket status to standard status
    const statusMap: Record<string, TrackingInfo['status']> = {
      '1': 'pending',      // AWB Assigned
      '2': 'pending',      // Label Generated
      '3': 'pending',      // Pickup Scheduled
      '4': 'pending',      // Pickup Queued
      '5': 'pending',      // Manifest Generated
      '6': 'in_transit',   // Shipped
      '7': 'delivered',    // Delivered
      '8': 'cancelled',    // Cancelled
      '9': 'exception',    // RTO Initiated
      '10': 'exception',   // RTO Delivered
      '11': 'pending',     // Pending
      '12': 'exception',   // Lost
      '13': 'in_transit',  // Pickup Error
      '14': 'exception',   // RTO Acknowledged
      '15': 'in_transit',  // Pickup Rescheduled
      '16': 'in_transit',  // Cancellation Requested
      '17': 'in_transit',  // Out for Delivery
      '18': 'in_transit',  // In Transit
      '19': 'exception',   // Out for Pickup
      '20': 'exception',   // Pickup Exception
    }

    return {
      trackingNumber,
      carrier: shipment?.courier_name || 'Shiprocket',
      status: statusMap[trackData.shipment_status.toString()] || 'pending',
      statusDescription: shipment?.current_status || 'Pending',
      estimatedDelivery: trackData.etd,
      deliveredAt: shipment?.delivered_date || undefined,
      events: activities.map((activity) => ({
        timestamp: new Date(activity.date).toISOString(),
        status: activity.sr_status_label,
        description: activity.activity,
        location: activity.location,
      })),
      trackingUrl: trackData.track_url,
    }
  }

  /**
   * Cancel a shipment
   */
  async cancelLabel(labelId: string): Promise<{ success: boolean; message?: string }> {
    try {
      await this.request<{ status: number; message: string }>(
        '/orders/cancel',
        {
          method: 'POST',
          body: JSON.stringify({
            ids: [parseInt(labelId)],
          }),
        }
      )

      return { success: true, message: 'Shipment cancelled successfully' }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to cancel shipment',
      }
    }
  }

  /**
   * Schedule pickup for shipments
   */
  async schedulePickup(shipmentIds: number[], pickupDate: string): Promise<{
    success: boolean
    pickupTokenNumber?: string
    message?: string
  }> {
    try {
      const response = await this.request<{
        pickup_status: number
        response: {
          pickup_scheduled_date: string
          pickup_token_number: string
        }
      }>('/courier/generate/pickup', {
        method: 'POST',
        body: JSON.stringify({
          shipment_id: shipmentIds,
          pickup_date: pickupDate,
        }),
      })

      return {
        success: response.pickup_status === 1,
        pickupTokenNumber: response.response.pickup_token_number,
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to schedule pickup',
      }
    }
  }

  /**
   * Get manifest (pickup slip) for shipments
   */
  async generateManifest(shipmentIds: number[]): Promise<{
    manifestUrl: string
  }> {
    const response = await this.request<{
      manifest_url: string
    }>('/manifests/generate', {
      method: 'POST',
      body: JSON.stringify({
        shipment_id: shipmentIds,
      }),
    })

    return {
      manifestUrl: response.manifest_url,
    }
  }

  /**
   * Get invoice for a shipment
   */
  async generateInvoice(orderIds: number[]): Promise<{
    invoiceUrl: string
  }> {
    const response = await this.request<{
      invoice_url: string
      not_created: number[]
    }>('/orders/print/invoice', {
      method: 'POST',
      body: JSON.stringify({
        ids: orderIds,
      }),
    })

    return {
      invoiceUrl: response.invoice_url,
    }
  }

  /**
   * Get all pickup locations
   */
  async getPickupLocations(): Promise<ShiprocketPickupLocation[]> {
    const response = await this.request<{
      data: {
        shipping_address: ShiprocketPickupLocation[]
      }
    }>('/settings/company/pickup')

    return response.data.shipping_address
  }

  /**
   * Add a new pickup location
   */
  async addPickupLocation(location: {
    pickup_location: string
    name: string
    email: string
    phone: string
    address: string
    address_2?: string
    city: string
    state: string
    country: string
    pin_code: string
  }): Promise<{ success: boolean; addressId?: number }> {
    const response = await this.request<{
      success: boolean
      address: {
        id: number
      }
    }>('/settings/company/addpickup', {
      method: 'POST',
      body: JSON.stringify(location),
    })

    return {
      success: response.success,
      addressId: response.address?.id,
    }
  }

  /**
   * Get channel (sales channel) list
   */
  async getChannels(): Promise<Array<{
    id: number
    name: string
    status: string
  }>> {
    const response = await this.request<{
      data: Array<{
        id: number
        name: string
        status: string
      }>
    }>('/channels')

    return response.data
  }

  /**
   * Check serviceability for a pincode
   */
  async checkServiceability(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
    cod: boolean = false
  ): Promise<{
    serviceable: boolean
    couriers: ShiprocketCourier[]
  }> {
    try {
      const rates = await this.getRates({
        fromAddress: { postalCode: pickupPincode } as ShipmentAddress,
        toAddress: { postalCode: deliveryPincode } as ShipmentAddress,
        parcels: [{ weight }],
        cod,
      })

      return {
        serviceable: rates.length > 0,
        couriers: rates.map(r => r.metadata as unknown as ShiprocketCourier),
      }
    } catch {
      return {
        serviceable: false,
        couriers: [],
      }
    }
  }

  /**
   * Get NDR (Non-Delivery Report) shipments
   */
  async getNDRShipments(): Promise<Array<{
    awb: string
    orderId: string
    ndrReason: string
    attempts: number
  }>> {
    const response = await this.request<{
      data: Array<{
        awb: string
        order_id: string
        ndr_reason: string
        attempts: number
      }>
    }>('/ndr/all')

    return response.data.map(item => ({
      awb: item.awb,
      orderId: item.order_id,
      ndrReason: item.ndr_reason,
      attempts: item.attempts,
    }))
  }

  /**
   * Take action on NDR shipment
   */
  async ndrAction(
    awb: string,
    action: 'reattempt' | 'return',
    comments?: string,
    preferredDate?: string
  ): Promise<{ success: boolean }> {
    const response = await this.request<{
      status: boolean
    }>('/ndr/action', {
      method: 'POST',
      body: JSON.stringify({
        awb,
        action: action === 'reattempt' ? 're-attempt' : 'return',
        comments,
        preferred_date: preferredDate,
      }),
    })

    return { success: response.status }
  }
}

// ============================================
// Factory Function
// ============================================

export function createShiprocketAdapter(config: ShiprocketConfig): ShiprocketAdapter {
  return new ShiprocketAdapter(config)
}
