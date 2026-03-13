import { cors } from '@elysiajs/cors'
import node from '@elysiajs/node'
import { Elysia } from 'elysia'
import { config } from './config'
import { upsertCredentials } from './lib/database'
import { log } from './lib/logs'

export function startAppSellServer() {
  const credentialsPath = '/events/store/credentials.upsert'

  const server = new Elysia({ adapter: node() })
    .use(
      cors({
        origin: '*',
        methods: ['POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'api-token'],
      }),
    )
    .post(credentialsPath, async ({ body, set, request }) => {
      try {
        const contentType = request.headers.get('content-type') ?? ''
        if (!contentType.toLowerCase().includes('application/json')) {
          set.status = 400
          return { ok: false, code: 'invalid_request', message: 'Essa solicitação não é compatível.' }
        }

        if (body == null) {
          set.status = 400
          return { ok: false, code: 'invalid_json', message: 'O corpo da solicitação não pôde ser decodificado como JSON' }
        }

        const payload = body as { storeId?: string; apiToken?: string; endpoint?: string }
        if (!payload.storeId || !payload.apiToken || !payload.endpoint) {
          set.status = 400
          return { ok: false, code: 'invalid_request', message: 'storeId, apiToken e endpoint são obrigatórios.' }
        }

        log.info(`Upserting AppSell credentials for store=${payload.storeId}`, 'credentials')

        await upsertCredentials(payload.storeId, payload.apiToken, payload.endpoint)

        log.success(`AppSell credentials saved: store=${payload.storeId}`, 'credentials')

        set.status = 200
        return { ok: true }
      } catch (e) {
        log.error(`Error upserting credentials: ${String(e)}`, 'credentials')
        set.status = 500
        return { ok: false, code: 'internal_error', message: 'Erro interno do servidor.' }
      }
    })
    .all('*', ({ set }) => {
      set.status = 400
      return { ok: false, code: 'invalid_request_url', message: 'Esse URL de solicitação não é válido.' }
    })
    .listen(config.PORT)

  log.success(
    `AppSell HTTP listening: http://0.0.0.0:${config.PORT}${credentialsPath}`,
    'appsell',
  )

  return {
    close: async () => {
      server.stop?.()
    },
  }
}
