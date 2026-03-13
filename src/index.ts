import 'dotenv/config'
import { startConsumer } from './consumer'
import { startAppSellServer } from './credentials-upsert-server'
import { initPublisher } from './publisher'
import { connectDatabase, disconnectDatabase, healthCheck } from './lib/database'
import { log } from './lib/logs'

log.info('Starting AppSell Connection (RabbitMQ + HTTP)...', 'bootstrap')

try {
  await connectDatabase()
} catch (e) {
  log.error(`Failed to connect DB: ${e}`, 'bootstrap')
  process.exit(1)
}

const dbHealth = await healthCheck()
if (!dbHealth) {
  log.error('Database health check failed - exiting', 'bootstrap')
  process.exit(1)
}
log.success('Database connection established', 'bootstrap')

// Start services
const consumer = await startConsumer()
await initPublisher()
const httpServer = startAppSellServer()

async function shutdown(signal: string) {
  log.info(`Shutting down gracefully (${signal})...`, 'bootstrap')

  try {
    await httpServer.close()
  } catch (e) {
    log.error(`Error closing HTTP server: ${e}`, 'bootstrap')
  }

  try {
    await consumer.close()
  } catch (e) {
    log.error(`Error closing RabbitMQ consumer: ${e}`, 'bootstrap')
  }

  try {
    await disconnectDatabase()
  } catch (e) {
    log.error(`Error closing database: ${e}`, 'bootstrap')
  }

  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
