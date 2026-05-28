import pino from 'pino'
import { createAlertEngineWorker } from './worker'

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

const worker = createAlertEngineWorker(logger)
logger.info('Alert engine worker started')

process.on('SIGTERM', async () => { await worker.close(); process.exit(0) })
process.on('SIGINT',  async () => { await worker.close(); process.exit(0) })
