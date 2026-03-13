import { z } from 'zod'

const schema = z.object({
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(4000),
})

export const config = schema.parse(process.env)
