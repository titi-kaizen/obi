import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { QUEUES } from '@ogasci/shared'
import type { DetectSignalsJob } from '@ogasci/shared'
import { detectSignals } from './detector'

export function createSignalDetectorWorker(logger: Logger) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const supabase = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  )

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const worker = new Worker<DetectSignalsJob>(
    QUEUES.DETECT_SIGNALS,
    async (job: Job<DetectSignalsJob>) => {
      const { articleId, category, entityIds, relevanceScore, keywords } = job.data
      const log = logger.child({ articleId, job: job.id })

      // Fetch article for title + summary
      const { data: article, error } = await supabase
        .from('articles')
        .select('title, summary')
        .eq('id', articleId)
        .single()

      if (error || !article) {
        log.warn('Article not found for signal detection')
        return
      }

      const signals = detectSignals({
        title:         article.title ?? '',
        summary:       article.summary ?? '',
        category,
        keywords,
        relevanceScore,
      })

      if (signals.length === 0) {
        log.debug('No signals detected')
        return
      }

      log.info({ count: signals.length }, 'Signals detected')

      // Insert signals
      for (const signal of signals) {
        await supabase.from('signals').insert({
          type:        signal.type,
          title:       signal.title,
          description: signal.description,
          severity:    signal.severity,
          status:      'active',
          article_ids: [articleId],
          entity_ids:  entityIds,
          metadata:    { source_article: articleId, keywords },
        })
      }

      return { signalsDetected: signals.length }
    },
    {
      connection,
      concurrency: 10,
      attempts: 2,
      backoff: { type: 'fixed', delay: 2000 },
    }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Signal detection failed')
  })

  return worker
}
