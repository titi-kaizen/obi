import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

import { authPlugin } from './plugins/auth'
import { supabasePlugin } from './plugins/supabase'
import { queuesPlugin } from './plugins/queues'
import { swaggerPlugin } from './plugins/swagger'

import { articlesRoutes } from './routes/articles'
import { searchRoutes } from './routes/search'
import { sourcesRoutes } from './routes/sources'
import { dashboardRoutes } from './routes/dashboard'
import { signalsRoutes } from './routes/signals'
import { alertsRoutes } from './routes/alerts'
import { briefRoutes } from './routes/brief'
import { adminRoutes } from './routes/admin'

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...(process.env['NODE_ENV'] === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
    trustProxy: true,
  })

  // ─── Security ───────────────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  })

  // ─── Core Plugins ────────────────────────────────────────────────────────────
  await app.register(swaggerPlugin)
  await app.register(supabasePlugin)
  await app.register(authPlugin)
  await app.register(queuesPlugin)

  // ─── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '0.1.0',
  }))

  // ─── Routes ──────────────────────────────────────────────────────────────────
  await app.register(articlesRoutes, { prefix: '/api' })
  await app.register(searchRoutes, { prefix: '/api' })
  await app.register(sourcesRoutes, { prefix: '/api' })
  await app.register(dashboardRoutes, { prefix: '/api' })
  await app.register(signalsRoutes, { prefix: '/api' })
  await app.register(alertsRoutes, { prefix: '/api' })
  await app.register(briefRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api' })

  return app
}
