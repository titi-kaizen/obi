import pino from 'pino'
import { createSignalDetectorWorker } from './worker'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

const worker = createSignalDetectorWorker(logger)
logger.info('Signal detector worker started')

process.on('SIGTERM', async () => {
  await worker.close()
  process.exit(0)
})
process.on('SIGINT', async () => {
  await worker.close()
  process.exit(0)
})
