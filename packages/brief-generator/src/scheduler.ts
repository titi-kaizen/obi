import { Queue, QueueScheduler } from 'bullmq'
import IORedis from 'ioredis'
import type { Logger } from 'pino'
import { QUEUES, BRIEF_GENERATION_HOUR } from '@ogasci/shared'
import type { GenerateBriefJob } from '@ogasci/shared'

/**
 * Schedules automatic daily brief generation at BRIEF_GENERATION_HOUR (7 AM Argentina time).
 * Uses a repeatable BullMQ job.
 */
export function scheduleDailyBrief(logger: Logger) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const queue = new Queue<GenerateBriefJob>(QUEUES.GENERATE_BRIEF, { connection })

  // Schedule: every day at BRIEF_GENERATION_HOUR (UTC-3 = Argentina)
  // Cron: 0 10 * * * = 7 AM ART (UTC-3)
  const cronExpression = `0 ${BRIEF_GENERATION_HOUR + 3} * * *`

  queue.add(
    'daily-brief-scheduled',
    {
      date:  new Date().toISOString().slice(0, 10), // placeholder, actual date set at runtime
      force: false,
    },
    {
      repeat: { pattern: cronExpression },
      jobId: 'daily-brief-scheduled',
    }
  ).then(() => {
    logger.info({ cron: cronExpression }, 'Daily brief scheduler registered')
  }).catch((err) => {
    logger.error({ err }, 'Failed to register daily brief scheduler')
  })

  return {
    close: async () => {
      await queue.close()
      await connection.quit()
    },
  }
}
