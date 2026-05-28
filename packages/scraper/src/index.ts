import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(__dirname, '../../../.env') })

import pino from 'pino'
import { createScrapeWorker } from './worker'
import { startScrapeScheduler } from './scheduler'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

const worker    = createScrapeWorker(logger)
const scheduler = startScrapeScheduler(logger)

logger.info('Scraper worker + scheduler started')

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down scraper')
  await scheduler.close()
  await worker.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await scheduler.close()
  await worker.close()
  process.exit(0)
})
