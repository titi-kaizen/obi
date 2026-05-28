import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { QUEUES, AI_MODELS } from '@ogasci/shared'
import type { GenerateBriefJob } from '@ogasci/shared'
import { generateBrief } from './generator'

export function createBriefGeneratorWorker(logger: Logger) {
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

  const worker = new Worker<GenerateBriefJob>(
    QUEUES.GENERATE_BRIEF,
    async (job: Job<GenerateBriefJob>) => {
      const { date, force, triggeredBy } = job.data
      const log = logger.child({ date, job: job.id })

      // Skip if job is just a "content ready" marker (not a real generate request)
      if (job.name === 'mark-content-ready' && !force) {
        log.debug('Content ready marker — skipping generation')
        return
      }

      // Check if brief already exists (unless force=true)
      if (!force) {
        const { data: existing } = await supabase
          .from('executive_briefs')
          .select('id')
          .eq('date', date)
          .single()

        if (existing) {
          log.info('Brief already exists for this date, skipping')
          return
        }
      }

      log.info('Starting brief generation')

      try {
        const { content, articlesAnalyzed } = await generateBrief(supabase, date, log)

        // Upsert (in case of force regeneration)
        const { error } = await supabase
          .from('executive_briefs')
          .upsert({
            date,
            content,
            model_used:        AI_MODELS.BRIEF,
            articles_analyzed: articlesAnalyzed,
            generated_at:      new Date().toISOString(),
            generated_by:      triggeredBy ?? null,
          }, { onConflict: 'date' })

        if (error) throw new Error(error.message)

        log.info({ articlesAnalyzed }, 'Brief generated successfully')
        return { date, articlesAnalyzed }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error({ err: message }, 'Brief generation failed')
        throw err
      }
    },
    {
      connection,
      concurrency: 1,  // Only one brief at a time to avoid duplicate Claude calls
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
    }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, date: job?.data.date, err }, 'Brief generation job failed')
  })

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, date: job.data.date }, 'Brief job completed')
  })

  return worker
}
