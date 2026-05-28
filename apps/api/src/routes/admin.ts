import type { FastifyPluginAsync } from 'fastify'
import { QUEUES } from '@ogasci/shared'
import type { ProcessArticleJob } from '@ogasci/shared'

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/queue-status  [admin, analyst]
  fastify.get('/admin/queue-status', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: { tags: ['Admin'] },
  }, async (_request, reply) => {
    const queueNames = Object.values(QUEUES)

    const statuses = await Promise.all(
      queueNames.map(async (name) => {
        const queue = fastify.queues[name]
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ])
        return { name, waiting, active, completed, failed, delayed }
      })
    )

    return { data: statuses }
  })

  // POST /api/admin/reprocess/:id  [admin, analyst]
  fastify.post<{ Params: { id: string } }>('/admin/reprocess/:id', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: { tags: ['Admin'] },
  }, async (request, reply) => {
    const { id } = request.params

    const { data: article, error } = await fastify.supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !article) return reply.status(404).send({ error: 'Article not found' })

    // Reset article status to pending
    await fastify.supabase
      .from('articles')
      .update({ status: 'pending', error_message: null })
      .eq('id', id)

    const job: ProcessArticleJob = {
      articleId: article.id,
      title:     article.title ?? '',
      content:   article.content ?? '',
      url:       article.url,
    }

    const queued = await fastify.queues[QUEUES.PROCESS_ARTICLE].add('reprocess', job, { priority: 1 })
    return { message: 'Article queued for reprocessing', jobId: queued.id }
  })

  // GET /api/admin/scrape-logs  [admin, analyst]
  fastify.get('/admin/scrape-logs', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: {
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          source_id: { type: 'string' },
          status:    { type: 'string', enum: ['running', 'success', 'failed'] },
          limit:     { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const { source_id, status, limit = 50 } = request.query as {
      source_id?: string; status?: string; limit?: number
    }

    let query = fastify.supabase
      .from('scrape_logs')
      .select('*, source:sources(name, url)')
      .order('started_at', { ascending: false })
      .limit(limit)

    if (source_id) query = query.eq('source_id', source_id)
    if (status)    query = query.eq('status', status)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return { data }
  })

  // GET /api/admin/processing-errors  [admin, analyst]
  fastify.get('/admin/processing-errors', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: {
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = 20 } = request.query as { limit?: number }

    const { data, error } = await fastify.supabase
      .from('articles')
      .select('id, title, url, error_message, retry_count, scraped_at, source:sources(name)')
      .eq('status', 'failed')
      .order('scraped_at', { ascending: false })
      .limit(limit)

    if (error) return reply.status(500).send({ error: error.message })
    return { data }
  })

  // POST /api/admin/scrape-all  [admin only] — trigger scrape for all active sources
  fastify.post('/admin/scrape-all', {
    preHandler: [fastify.requireRole(['admin'])],
    schema: { tags: ['Admin'] },
  }, async (_request, reply) => {
    const { data: sources, error } = await fastify.supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)

    if (error) return reply.status(500).send({ error: error.message })

    const jobs = await fastify.queues[QUEUES.SCRAPE].addBulk(
      (sources ?? []).map((source) => ({
        name: 'scrape-scheduled',
        data: {
          sourceId:   source.id,
          sourceName: source.name,
          sourceUrl:  source.url,
          sourceType: source.type,
          selector:   source.selector,
        },
      }))
    )

    return { message: `Queued ${jobs.length} scrape jobs`, count: jobs.length }
  })
}
