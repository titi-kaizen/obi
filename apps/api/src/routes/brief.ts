import type { FastifyPluginAsync } from 'fastify'
import { QUEUES } from '@ogasci/shared'
import type { GenerateBriefJob } from '@ogasci/shared'

export const briefRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/brief/today
  fastify.get('/brief/today', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Brief'] },
  }, async (_request, reply) => {
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await fastify.supabase
      .from('executive_briefs')
      .select('*')
      .eq('date', today)
      .single()

    if (error || !data) {
      return reply.status(404).send({
        error: 'No brief available for today',
        hint: 'POST /api/brief/generate to generate one',
      })
    }

    return { data }
  })

  // GET /api/brief/:date
  fastify.get<{ Params: { date: string } }>('/brief/:date', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Brief'],
      params: {
        type: 'object',
        properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
      },
    },
  }, async (request, reply) => {
    const { date } = request.params

    const { data, error } = await fastify.supabase
      .from('executive_briefs')
      .select('*')
      .eq('date', date)
      .single()

    if (error || !data) return reply.status(404).send({ error: `No brief found for ${date}` })
    return { data }
  })

  // POST /api/brief/generate  [admin, analyst]
  fastify.post('/brief/generate', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: {
      tags: ['Brief'],
      body: {
        type: 'object',
        properties: {
          date:  { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          force: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { date, force = false } = (request.body as { date?: string; force?: boolean }) ?? {}
    const targetDate = date ?? new Date().toISOString().slice(0, 10)

    // Check if brief already exists (and force=false)
    if (!force) {
      const { data: existing } = await fastify.supabase
        .from('executive_briefs')
        .select('id, generated_at')
        .eq('date', targetDate)
        .single()

      if (existing) {
        return reply.status(409).send({
          error: 'Brief already exists for this date',
          data: { id: existing.id, generated_at: existing.generated_at },
          hint: 'Pass force: true to regenerate',
        })
      }
    }

    const job: GenerateBriefJob = {
      date: targetDate,
      force,
      triggeredBy: request.user.id,
    }

    const queued = await fastify.queues[QUEUES.GENERATE_BRIEF].add('generate-brief', job, {
      priority: 1,
    })

    return reply.status(202).send({
      message: `Brief generation queued for ${targetDate}`,
      jobId: queued.id,
    })
  })

  // GET /api/brief (list)
  fastify.get('/brief', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Brief'],
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 30, default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 10 } = request.query as { page?: number; limit?: number }

    const { data, error, count } = await fastify.supabase
      .from('executive_briefs')
      .select('id, date, articles_analyzed, model_used, generated_at, top_entities, key_signals', { count: 'exact' })
      .order('date', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) return reply.status(500).send({ error: error.message })
    return {
      data,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    }
  })
}
