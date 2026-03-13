import { z } from 'zod'
import { getCredentialsByStoreId, logEvent } from '../lib/database'
import { log } from '../lib/logs'

type HandlerResult = { success: true; data: null } | { success: false; data: { requeue: boolean } }

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const orderSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  store_id: z.string().min(1),
  payment_method_id: z.string().nullable().optional(),
  subscription_id: z.string().nullable().optional(),
  status: z.string().min(1),
  billing_reason: z.string().optional(),
  currency: z.string().optional(),
  total_amount: z.number().optional(),
  net_amount: z.number().optional(),
  fee_amount: z.number().optional(),
  created_at: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  subscription: z.object({
    id: z.string(),
    user_id: z.string(),
    currency: z.string(),
    amount: z.number(),
    status: z.string(),
    current_period_start: z.string(),
    current_period_end: z.string(),
    cancel_at_period_end: z.boolean(),
    canceled_at: z.string().nullable(),
  }).nullable().optional(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      order_id: z.string(),
      price_id: z.string(),
      amount: z.number(),
      created_at: z.string().optional(),
      modified_at: z.string().nullable().optional(),
    }),
  ).optional(),
})

type OrderEvent = z.infer<typeof orderSchema>

/** Mapeia o status do billing para o evento da AppSell */
function mapStatusToAppSellEvent(status: string, billingReason?: string): string | null {
  switch (status) {
    case 'paid':
      return 'approved'
    case 'refunded':
      return 'refunded'
    case 'chargedback':
      return 'chargedback'
    case 'canceled':
      return billingReason?.includes('subscription') ? 'subscription_cancelled' : null
    case 'active':
      return 'subscription_reactivated'
    default:
      return 'approved'
  }
}

/** Monta o payload no formato da API da AppSell */
function buildAppSellPayload(order: OrderEvent, appSellEvent: string) {
  const metadata = order.metadata ?? {}

  return {
    id: order.id,
    event: appSellEvent,
    customer: {
      name: metadata.customer_name as string ?? order.user?.email ?? 'Unknown',
      email: order.user?.email ?? '',
      phone: metadata.customer_phone as string ?? '',
      doc: metadata.customer_doc as string ?? '',
    },
    products: (order.items ?? []).map((item: any) => ({
      id: item.price_id,
      name: item.price_id,
      price_in_cents: item.amount,
      type: 'main' as const,
    })),
    tracking: {
      url: metadata.tracking_url as string | undefined,
      src: metadata.utm_source as string | undefined,
      utm_campaign: metadata.utm_campaign as string | undefined,
      utm_medium: metadata.utm_medium as string | undefined,
      utm_content: metadata.utm_content as string | undefined,
      utm_term: metadata.utm_term as string | undefined,
      utm_source: metadata.utm_source as string | undefined,
    },
    currency: (order.currency ?? 'BRL').toUpperCase(),
  }
}

/**
 * Handler para processar eventos de pedido.
 * Recebe eventos do RabbitMQ (billing), transforma no formato da AppSell e envia via POST.
 */
export async function orderProcess(message: string): Promise<HandlerResult> {
  const scope = 'order-handler'

  const raw = safeJsonParse<OrderEvent>(message)
  if (!raw) {
    log.warn(`Invalid JSON payload: ${message}`, scope)
    await logEvent({
      eventType: 'order-process',
      status: 'failed',
      payload: { raw: message, reason: 'invalid_json' },
      contactEmail: null,
      contactId: null,
    })
    return { success: false, data: { requeue: false } }
  }

  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) {
    log.warn(`Invalid order payload: ${parsed.error.message}`, scope)
    await logEvent({
      storeId: raw.store_id ?? null,
      eventType: 'order-process',
      status: 'failed',
      errorMessage: parsed.error.message,
      contactId: raw.user_id ?? null,
      contactEmail: raw.user?.email ?? null,
      payload: raw,
    })
    return { success: false, data: { requeue: false } }
  }

  const order = parsed.data

  // Mapeia status do billing para evento da AppSell
  const appSellEvent = mapStatusToAppSellEvent(order.status, order.billing_reason)
  if (!appSellEvent) {
    log.info(`Status "${order.status}" does not map to an AppSell event, skipping`, scope)
    return { success: true, data: null }
  }

  try {
    log.info(`Processing order ${order.id} status=${order.status} -> AppSell event=${appSellEvent}`, scope)

    // Busca o api-token da loja no banco
    const credentials = await getCredentialsByStoreId(order.store_id)
    if (!credentials) {
      log.error(`No AppSell credentials found for store ${order.store_id}`, scope)
      await logEvent({
        storeId: order.store_id,
        eventType: `order-process.${appSellEvent}`,
        status: 'failed',
        errorMessage: `No AppSell credentials for store ${order.store_id}`,
        contactId: order.user_id,
        contactEmail: order.user?.email ?? null,
        payload: order,
      })
      return { success: false, data: { requeue: false } }
    }

    // Monta o payload no formato da AppSell
    const appSellPayload = buildAppSellPayload(order, appSellEvent)

    // Envia POST para a API da AppSell usando endpoint salvo no banco
    const response = await fetch(credentials.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-token': credentials.apiToken,
      },
      body: JSON.stringify(appSellPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      log.error(`AppSell API returned ${response.status}: ${errorBody}`, scope)
      await logEvent({
        storeId: order.store_id,
        eventType: `order-process.${appSellEvent}`,
        status: 'failed',
        errorMessage: `AppSell API ${response.status}: ${errorBody}`,
        contactId: order.user_id,
        contactEmail: order.user?.email ?? null,
        payload: { order, appSellPayload },
      })
      // Requeue on 429 (rate limit) or 5xx
      const shouldRequeue = response.status === 429 || response.status >= 500
      return { success: false, data: { requeue: shouldRequeue } }
    }

    await logEvent({
      storeId: order.store_id,
      eventType: `order-process.${appSellEvent}`,
      status: 'success',
      contactId: order.user_id,
      contactEmail: order.user?.email ?? null,
      payload: { order, appSellPayload },
    })

    log.success(`Order ${order.id} sent to AppSell (event=${appSellEvent})`, scope)
    return { success: true, data: null }
  } catch (error) {
    const msg = (error as Error)?.message ?? String(error)
    log.error(`Failed to process order ${order.id}: ${msg}`, scope)
    await logEvent({
      storeId: order.store_id,
      eventType: `order-process.${appSellEvent}`,
      status: 'failed',
      errorMessage: msg,
      contactId: order.user_id,
      contactEmail: order.user?.email ?? null,
      payload: order,
    })
    return { success: false, data: { requeue: true } }
  }
}
