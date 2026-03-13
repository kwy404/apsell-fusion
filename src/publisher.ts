import { connection } from '@/consumer'

const EXCHANGE = 'appsell'

let channel: Awaited<ReturnType<typeof connection.createChannel>>

export async function initPublisher() {
  channel = await connection.createChannel()
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
}

export function publish(event: string, message: unknown) {
  if (!channel) {
    throw new Error('Publisher not initialized. Call initPublisher() first.')
  }
  channel.publish(EXCHANGE, event, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  })
}

export const publisher = { publish }