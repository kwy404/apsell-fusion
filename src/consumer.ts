import { type Channel, type ConsumeMessage, connect } from 'amqplib'
import { config } from './config'
import { orderProcess } from './handlers/order-process'
import { log } from './lib/logs'

const QUEUE = 'appsell-connection'

const BINDINGS = [
  { source: 'billing', event: 'order.created' },
  { source: 'billing', event: 'order.paid' },
  { source: 'billing', event: 'order.updated' },
  { source: 'billing', event: 'order.refunded' },
] as const

type HandlerResult = { success: true; data: null } | { success: false; data: { requeue: boolean } }

type Handler = (message: string) => Promise<HandlerResult>

const handlers: Record<string, Handler> = {
  'order.created': (msg) => orderProcess(msg),
  'order.paid': (msg) => orderProcess(msg),
  'order.updated': (msg) => orderProcess(msg),
  'order.refunded': (msg) => orderProcess(msg),
}

async function safeAck(channel: Channel, msg: ConsumeMessage) {
  try {
    channel.ack(msg, false)
  } catch (e) {
    log.error(`Failed to ack message: ${e}`, 'consumer')
  }
}

async function safeNack(channel: Channel, msg: ConsumeMessage, requeue: boolean) {
  try {
    channel.nack(msg, false, requeue)
  } catch (e) {
    log.error(`Failed to nack message: ${e}`, 'consumer')
  }
}

export const connection = await connect(config.RABBITMQ_URL)

export async function startConsumer() {
  log.info('Starting AppSell Consumer...', 'consumer')

  const channel = await connection.createChannel()

  log.success('Connected to RabbitMQ', 'consumer')

  await channel.prefetch(20)

  await channel.assertExchange(`${QUEUE}-dlx`, 'fanout', { durable: true })

  await channel.assertQueue(`${QUEUE}-dlq`, { durable: true })

  await channel.bindQueue(`${QUEUE}-dlq`, `${QUEUE}-dlx`, '')

  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': `${QUEUE}-dlx` },
  })

  const exchanges = [...new Set(BINDINGS.map((b) => b.source))]

  for (const exchange of exchanges) {
    await channel.assertExchange(exchange, 'topic', { durable: true })
    log.debug(`Exchange asserted: ${exchange}`, 'consumer')
  }

  for (const binding of BINDINGS) {
    await channel.bindQueue(QUEUE, binding.source, binding.event)
    log.debug(`Binding: ${binding.source} -> ${binding.event}`, 'consumer')
  }

  log.success(`Consumer listening to queue: ${QUEUE}`, 'consumer')
  log.info(`Listening to ${BINDINGS.length} event(s)`, 'consumer')

  await channel.consume(
    QUEUE,
    async (message: ConsumeMessage | null) => {
      if (!message) return

      const event = message.fields.routingKey

      const handler = handlers[event]

      if (!handler) {
        log.warn(`No handler found for ${event}`, 'consumer')
        return safeNack(channel, message, false)
      }

      try {
        const payload = message.content.toString('utf8')
        const result = await handler(payload)

        if (!result.success) {
          log.error(`Handler failed for ${event}`, 'consumer')
          return safeNack(channel, message, result.data.requeue)
        }

        await safeAck(channel, message)
        log.success(`Event processed: ${event}`, 'consumer')
      } catch (error) {
        log.error(`Unexpected error processing ${event}: ${error}`, 'consumer')
        return safeNack(channel, message, true)
      }
    },
    { noAck: false },
  )

  return {
    close: async () => {
      try {
        await channel.close()
      } catch (e) {
        log.error(`Error closing channel: ${e}`, 'consumer')
      }
      try {
        await connection.close()
      } catch (e) {
        log.error(`Error closing connection: ${e}`, 'consumer')
      }
    },
  }
}
