import type { FastifyPluginAsync } from 'fastify'
import { QUEUES } from '@ogasci/shared'
import type { ScrapeJob } from '@ogasci/shared'

export const sourcesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/sources
  fastify.get('/sources', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Sources'],
      querystring: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', default: false },
          type:        { type: 'string', enum: ['rss', 'html', 'playwright'] },
        },
      },
    },
  }, async (request, reply) => {
    const { active_only, type } = request.query as { active_only?: boolean; type?: string }

    let query = fastify.supabase
      .from('sources')
      .select('*')
      .order('name')

    if (active_only) query = query.eq('is_active', true)
    if (type)        query = query.eq('type', type)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return { data }
  })

  // POST /api/sources  [admin only]
  fastify.post('/sources', {
    preHandler: [fastify.requireRole(['admin'])],
    schema: {
      tags: ['Sources'],
      body: {
        type: 'object',
        required: ['name', 'url', 'type', 'category'],
        properties: {
          name:                    { type: 'string', minLength: 2 },
          url:                     { type: 'string', format: 'uri' },
          type:                    { type: 'string', enum: ['rss', 'html', 'playwright'] },
          category:                { type: 'string' },
          selector:                { type: 'string' },
          scrape_interval_minutes: { type: 'integer', minimum: 5, default: 60 },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      name: string; url: string; type: string; category: string
      selector?: string; scrape_interval_minutes?: number
    }

    const { data, error } = await fastify.supabase
      .from('sources')
      .insert(body)
      .select()
      .single()

    if (error) return reply.status(400).send({ error: error.message })
    return reply.status(201).send({ data })
  })

  // POST /api/sources/:id/test  [admin, analyst]
  fastify.post<{ Params: { id: string } }>('/sources/:id/test', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: { tags: ['Sources'] },
  }, async (request, reply) => {
    const { id } = request.params

    const { data: source, error } = await fastify.supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !source) return reply.status(404).send({ error: 'Source not found' })

    const job: ScrapeJob = {
      sourceId:   source.id,
      sourceName: source.name,
      sourceUrl:  source.url,
      sourceType: source.type,
      selector:   source.selector,
    }

    const queued = await fastify.queues[QUEUES.SCRAPE].add('scrape-manual', job, {
      priority: 1,  // high priority for manual test
    })

    return { message: 'Scrape job queued', jobId: queued.id }
  })

  // POST /api/sources/:id/toggle  [admin only]
  fastify.post<{ Params: { id: string } }>('/sources/:id/toggle', {
    preHandler: [fastify.requireRole(['admin'])],
    schema: { tags: ['Sources'] },
  }, async (request, reply) => {
    const { id } = request.params

    const { data: current } = await fastify.supabase
      .from('sources')
      .select('is_active')
      .eq('id', id)
      .single()

    if (!current) return reply.status(404).send({ error: 'Source not found' })

    const { data, error } = await fastify.supabase
      .from('sources')
      .update({ is_active: !current.is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.status(500).send({ error: error.message })
    return { data, message: `Source ${data.is_active ? 'activated' : 'deactivated'}` }
  })
}
