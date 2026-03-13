import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import { log } from './logs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })

export async function connectDatabase() {
  await prisma.$connect()
  log.success('Database connected (Prisma)', 'database')
}

export async function disconnectDatabase() {
  await prisma.$disconnect()
  log.info('Database disconnected', 'database')
}

export async function healthCheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    log.error(`Database health check failed: ${error}`, 'database')
    return false
  }
}

// --- Credentials ---

export async function getCredentialsByToken(apiToken: string) {
  return prisma.appSellCredentials.findFirst({
    where: { apiToken, active: true },
  })
}

export async function getCredentialsByStoreId(storeId: string) {
  return prisma.appSellCredentials.findFirst({
    where: { storeId, active: true },
  })
}

export async function upsertCredentials(storeId: string, apiToken: string, endpoint: string) {
  // Ensure store exists
  await prisma.store.upsert({
    where: { storeId },
    create: { storeId, name: storeId, active: true },
    update: { active: true },
  })

  return prisma.appSellCredentials.upsert({
    where: { storeId },
    create: { storeId, apiToken, endpoint, active: true },
    update: { apiToken, endpoint, active: true },
  })
}

// --- Event Logs ---

export async function logEvent(input: {
  storeId?: string | null
  eventType: string
  payload?: unknown
  status: 'success' | 'failed'
  errorMessage?: string | null
  contactId?: string | null
  contactEmail?: string | null
}) {
  try {
    await prisma.eventLog.create({
      data: {
        storeId: input.storeId ?? null,
        eventType: input.eventType,
        payload: input.payload != null ? (input.payload as object) : undefined,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        contactId: input.contactId ?? null,
        contactEmail: input.contactEmail ?? null,
      },
    })
  } catch (error) {
    log.error(`Failed to log event: ${error}`, 'event-logs')
  }
}
