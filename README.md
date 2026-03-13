# AppSell Connection

Serviço que conecta a plataforma na AppSell via RabbitMQ. Recebe eventos de pedido do billing e processa para liberar/gerenciar acessos na AppSell.

**Versão:** 1.0.0

---

## O que esse trem faz

- **Consumer RabbitMQ** – Escuta eventos de `billing` (order.created, order.paid, order.updated, order.refunded) e processa os pedidos.
- **API HTTP** – Endpoint para receber webhooks da plataforma de vendas com validação de token, e endpoint para salvar credenciais (api-token).
- **Banco** – PostgreSQL via Prisma: stores, credenciais da AppSell (api-token), e log de eventos.

---

## Como sobe (quick start)

**Precisa ter:** Node.js 20+, npm, Docker (PostgreSQL e RabbitMQ).

1. **Clona e instala**

```bash
git clone https://github.com/kwy404/apsell-fusion
cd appsell
npm install
```

2. **Variáveis de ambiente**

```bash
cp .env.example .env
```

Preenche:

- `RABBITMQ_URL` – tipo `amqp://admin:docker@localhost:5672`
- `DATABASE_URL` – tipo `postgresql://postgres:docker@localhost:15255/appsell`

Opcional: `PORT` (padrão 5255), `LOG_LEVEL` (padrão info), `NODE_ENV`.

3. **Sobe os dependentes**

```bash
docker-compose up -d
```

4. **Gera o Prisma Client e aplica o schema**

```bash
npm run db:push
npm run db:generate
```

5. **Roda o serviço**

```bash
npm run dev
```

---

## RabbitMQ

- **Fila:** `appsell-connection`
- **Exchange:** `billing` (topic)

**Eventos escutados:**

- `order.created`
- `order.paid`
- `order.updated`
- `order.refunded`

O body da mensagem é JSON com `id`, `store_id`, `user_id`, `status`, `currency`, `total_amount`, `items`, `user`, `metadata`, etc.

---

## API HTTP

| Método | Caminho | O que faz |
|--------|---------|-----------|
| POST | `/events/store/credentials.upsert` | Salva ou atualiza o api-token da AppSell para uma loja. Body: `{ "storeId": "...", "apiToken": "..." }` |
| POST | `/api/1.1/wf/appsell` | Endpoint que recebe webhooks da plataforma de vendas. Header obrigatório: `api-token`. |

---

## API da AppSell (webhook recebido)

A plataforma de vendas envia POST para o endpoint com o header `api-token`.

**Eventos suportados:** `approved`, `refunded`, `chargedback`, `subscription_reactivated`, `subscription_cancelled`

**Payload exemplo:**

```json
{
  "id": "id_000000001",
  "event": "approved",
  "customer": {
    "name": "John Smith",
    "email": "johnsmith@gmail.com",
    "phone": "5511999887766",
    "doc": "48923116898"
  },
  "products": [
    {
      "id": "23fsd2343",
      "name": "course x",
      "price_in_cents": 1990,
      "type": "main"
    }
  ],
  "tracking": {
    "src": "campanha1",
    "utm_campaign": "Campaign"
  },
  "currency": "BRL"
}
```

---

## Banco de dados (Prisma)

Schema em `prisma/schema.prisma`. Tabelas:

- `stores` – Lojas
- `appsell_credentials` – Token da API por loja
- `event_logs` – Log de eventos processados

---

## Build e produção

```bash
npm run build
npm run start
```

---

## Testes

```bash
npm test
```

---

## Códigos de status da API

| HTTP | Descrição |
|------|-----------|
| 200 | Solicitação processada com sucesso |
| 400 | Payload inválido ou request incompatível |
| 401 | Token inválido ou ausente |
| 429 | Rate limit (máx ~3 req/s) |
| 500 | Erro interno |
