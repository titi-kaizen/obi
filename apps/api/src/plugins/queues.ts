import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { QUEUES } from '@ogasci/shared'

export const queuesPlugin = fp(async (fastify) => {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  connection.on('error', (err) => fastify.log.error({ err }, 'Redis connection error'))
  connection.on('connect', () => fastify.log.info('Redis connected'))

  const queues = Object.fromEntries(
    Object.values(QUEUES).map((name) => [
      name,
      new Queue(name, { connection }),
    ])
  ) as Record<string, Queue>

  fastify.decorate('queues', queues)

  fastify.addHook('onClose', async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()))
    await connection.quit()
  })
}, { name: 'queues' })
