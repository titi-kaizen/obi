import type { FastifyPluginAsync } from 'fastify'

export const alertsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/alert-rules
  fastify.get('/alert-rules', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Alerts'] },
  }, async (request, reply) => {
    const isAdmin = request.user.role === 'admin'

    let query = fastify.supabase
      .from('alert_rules')
      .select('*')
      .order('created_at', { ascending: false })

    if (!isAdmin) query = query.eq('user_id', request.user.id)

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: error.message })
    return { data }
  })

  // POST /api/alert-rules
  fastify.post('/alert-rules', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Alerts'],
      body: {
        type: 'object',
        required: ['name', 'conditions', 'channels'],
        properties: {
          name:        { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string' },
          conditions: {
            type: 'object',
            properties: {
              keywords:     { type: 'array', items: { type: 'string' } },
              categories:   { type: 'array', items: { type: 'string' } },
              entity_names: { type: 'array', items: { type: 'string' } },
              signal_types: { type: 'array', items: { type: 'string' } },
              min_relevance: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          channels: {
            type: 'object',
            properties: {
              email:       { type: 'boolean' },
              slack:       { type: 'boolean' },
              webhook_url: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      name: string; description?: string
      conditions: Record<string, unknown>; channels: Record<string, unknown>
    }

    const { data, error } = await fastify.supabase
      .from('alert_rules')
      .insert({ ...body, user_id: request.user.id })
      .select()
      .single()

    if (error) return reply.status(400).send({ error: error.message })
    return reply.status(201).send({ data })
  })

  // PATCH /api/alert-rules/:id
  fastify.patch<{ Params: { id: string } }>('/alert-rules/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Alerts'],
      body: {
        type: 'object',
        properties: {
          name:        { type: 'string' },
          description: { type: 'string' },
          conditions:  { type: 'object' },
          channels:    { type: 'object' },
          is_active:   { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const body = request.body as Record<string, unknown>

    // Ensure user owns the rule (or is admin)
    const { data: existing } = await fastify.supabase
      .from('alert_rules')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) return reply.status(404).send({ error: 'Rule not found' })
    if (existing.user_id !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const { data, error } = await fastify.supabase
      .from('alert_rules')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return reply.status(400).send({ error: error.message })
    return { data }
  })

  // DELETE /api/alert-rules/:id
  fastify.delete<{ Params: { id: string } }>('/alert-rules/:id', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Alerts'] },
  }, async (request, reply) => {
    const { id } = request.params

    const { data: existing } = await fastify.supabase
      .from('alert_rules')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) return reply.status(404).send({ error: 'Rule not found' })
    if (existing.user_id !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const { error } = await fastify.supabase.from('alert_rules').delete().eq('id', id)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(204).send()
  })

  // GET /api/alert-rules/events
  fastify.get('/alert-rules/events', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Alerts'],
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
    const isAdmin = request.user.role === 'admin'

    let query = fastify.supabase
      .from('alert_events')
      .select(
        isAdmin
          ? '*, rule:alert_rules(name, user_id), article:articles(title, url)'
          : '*, rule:alert_rules!inner(name, user_id), article:articles(title, url)',
        { count: 'exact' }
      )
      .order('triggered_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (!isAdmin) {
      query = query.eq('rule.user_id', request.user.id)
    }

    const { data, error, count } = await query
    if (error) return reply.status(500).send({ error: error.message })

    return {
      data,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    }
  })
}
