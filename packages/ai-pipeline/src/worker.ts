import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { QUEUES, MAX_ARTICLE_RETRIES } from '@ogasci/shared'
import type { ProcessArticleJob, DetectSignalsJob, EvaluateAlertsJob } from '@ogasci/shared'
import { classifyArticle } from './claude'

export function createAIPipelineWorker(logger: Logger) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const supabaseUrl = process.env['SUPABASE_URL']!
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const signalsQueue = new Queue(QUEUES.DETECT_SIGNALS, { connection })
  const alertsQueue  = new Queue(QUEUES.EVALUATE_ALERTS, { connection })
  const briefQueue   = new Queue(QUEUES.GENERATE_BRIEF, { connection })

  const worker = new Worker<ProcessArticleJob>(
    QUEUES.PROCESS_ARTICLE,
    async (job: Job<ProcessArticleJob>) => {
      const { articleId, title, content, url } = job.data
      const log = logger.child({ articleId, job: job.id })

      // Skip articles with no content worth processing
      if (!title && !content) {
        log.warn('Skipping article with no title or content')
        await supabase.from('articles').update({ status: 'failed', error_message: 'No content to process' }).eq('id', articleId)
        return
      }

      // Mark as processing
      await supabase.from('articles').update({ status: 'processing' }).eq('id', articleId)

      // Groq free tier: ~30 req/min — add small delay to stay within limits
      await new Promise(resolve => setTimeout(resolve, 2000))

      log.info('Classifying article with Groq')
      const result = await classifyArticle(title || url, content || title || '', url)

      // ── Upsert entities and build article_entities rows ─────────────────────
      const entityInserts: Array<{ article_id: string; entity_id: string; context: string; relevance: number }> = []

      for (const ent of result.entities) {
        if (!ent.name.trim()) continue

        const normalizedName = ent.name.trim().toLowerCase()

        // Upsert entity (match by normalized_name + type)
        const { data: entity, error: entityError } = await supabase
          .from('entities')
          .upsert(
            { name: ent.name.trim(), type: ent.type, normalized_name: normalizedName },
            { onConflict: 'normalized_name,type', ignoreDuplicates: false }
          )
          .select('id')
          .single()

        if (entityError || !entity) {
          log.warn({ error: entityError?.message, entity: ent.name }, 'Failed to upsert entity')
          continue
        }

        entityInserts.push({
          article_id: articleId,
          entity_id:  entity.id,
          context:    ent.context,
          relevance:  result.relevance_score,
        })
      }

      // ── Update article ───────────────────────────────────────────────────────
      const now = new Date().toISOString()
      await supabase.from('articles').update({
        status:              'done',
        category:            result.category,
        subcategory:         result.subcategory,
        sentiment:           result.sentiment,
        relevance_score:     result.relevance_score,
        supply_chain_impact: result.supply_chain_impact,
        keywords:            result.keywords,
        summary:             result.summary,
        processed_at:        now,
        error_message:       null,
      }).eq('id', articleId)

      // Insert article-entity relationships
      if (entityInserts.length > 0) {
        await supabase.from('article_entities').upsert(entityInserts, {
          onConflict: 'article_id,entity_id',
          ignoreDuplicates: true,
        })
      }

      log.info({
        category:       result.category,
        relevance:      result.relevance_score,
        entities:       result.entities.length,
      }, 'Article processed successfully')

      // ── Enqueue downstream workers ────────────────────────────────────────────
      const entityIds = entityInserts.map((e) => e.entity_id)
      const entityNames = result.entities.map((e) => e.name)

      const detectJob: DetectSignalsJob = {
        articleId,
        category:       result.category,
        entityIds,
        relevanceScore: result.relevance_score,
        keywords:       result.keywords,
      }

      const alertsJob: EvaluateAlertsJob = {
        articleId,
        category:       result.category,
        keywords:       result.keywords,
        entityNames,
        relevanceScore: result.relevance_score,
      }

      await Promise.all([
        signalsQueue.add('detect-signals', detectJob),
        alertsQueue.add('evaluate-alerts', alertsJob),
      ])

      // Daily brief uses scheduled job, but we can flag that new content is ready
      const todayDate = new Date().toISOString().slice(0, 10)
      await briefQueue.add(
        'mark-content-ready',
        { date: todayDate, force: false },
        { jobId: `brief-content-ready-${todayDate}`, skipDuplicates: true }
      )

      return { category: result.category, relevance: result.relevance_score }
    },
    {
      connection,
      concurrency: 1,
      attempts: MAX_ARTICLE_RETRIES,
      backoff: { type: 'exponential', delay: 3000 },
    }
  )

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err }, 'AI pipeline job failed')
    if (job?.data.articleId) {
      await supabase
        .from('articles')
        .update({
          status:        'failed',
          error_message: err.message,
          retry_count:   (job.attemptsMade ?? 0),
        })
        .eq('id', job.data.articleId)
    }
  })

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'AI pipeline job completed')
  })

  return worker
}
