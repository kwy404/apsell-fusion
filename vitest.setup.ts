// Minimal env so config.parse() does not throw when running tests.
// Real DATABASE_URL is still required for the order-process integration test.
if (!process.env.RABBITMQ_URL) process.env.RABBITMQ_URL = 'amqp://localhost'
if (!process.env.DATABASE_URL)
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/appsell_test'
