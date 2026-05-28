import pino from 'pino'
import { createBriefGeneratorWorker } from './worker'
import { scheduleDailyBrief } from './scheduler'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

if (!process.env['GROQ_API_KEY']) {
  logger.error('Missing GROQ_API_KEY — brief generator cannot start')
  process.exit(1)
}

const worker = createBriefGeneratorWorker(logger)
const scheduler = scheduleDailyBrief(logger)

logger.info('Brief generator worker started')

process.on('SIGTERM', async () => {
  await worker.close()
  await scheduler.close()
  process.exit(0)
})
process.on('SIGINT', async () => {
  await worker.close()
  await scheduler.close()
  process.exit(0)
})
