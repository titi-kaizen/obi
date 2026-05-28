import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(__dirname, '../../../.env') })

import pino from 'pino'
import { createAIPipelineWorker } from './worker'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

if (!process.env['GROQ_API_KEY']) {
  logger.error('Missing GROQ_API_KEY — AI pipeline cannot start')
  process.exit(1)
}

const worker = createAIPipelineWorker(logger)
logger.info('AI Pipeline worker started')

process.on('SIGTERM', async () => {
  logger.info('Shutting down AI pipeline worker')
  await worker.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await worker.close()
  process.exit(0)
})
