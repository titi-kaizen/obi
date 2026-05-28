import type { FastifyPluginAsync } from 'fastify'

export const signalsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/signals
  fastify.get('/signals', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Signals'],
      querystring: {
        type: 'object',
        properties: {
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          type:     { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          status:   { type: 'string', enum: ['active', 'resolved', 'dismissed'], default: 'active' },
        },
      },
    },
  }, async (request, reply) => {
    const q = request.query as {
      page: number; limit: number; type?: string; severity?: string; status?: string
    }
    const { page = 1, limit = 20, type, severity, status = 'active' } = q

    let query = fastify.supabase
      .from('signals')
      .select('*', { count: 'exact' })
      .order('detected_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (type)     query = query.eq('type', type)
    if (severity) query = query.eq('severity', severity)
    if (status)   query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) return reply.status(500).send({ error: error.message })

    return {
      data,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    }
  })

  // GET /api/signals/trending  — active signals from last 48h
  fastify.get('/signals/trending', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Signals'] },
  }, async (_request, reply) => {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { data, error } = await fastify.supabase
      .from('signals')
      .select('*')
      .eq('status', 'active')
      .gte('detected_at', since)
      .order('severity', { ascending: false })  // critical first
      .order('detected_at', { ascending: false })
      .limit(20)

    if (error) return reply.status(500).send({ error: error.message })
    return { data }
  })

  // PATCH /api/signals/:id/resolve
  fastify.patch<{ Params: { id: string }; Body: { status: string; note?: string } }>('/signals/:id/resolve', {
    preHandler: [fastify.requireRole(['admin', 'analyst'])],
    schema: {
      tags: ['Signals'],
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['resolved', 'dismissed'] },
          note:   { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const { status, note } = request.body

    const update: Record<string, unknown> = {
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: request.user.id,
    }
    if (note) update['metadata'] = { resolution_note: note }

    const { data, error } = await fastify.supabase
      .from('signals')
      .update(update)
      .eq('id', id)
      .eq('status', 'active')  // can only resolve active signals
      .select()
      .single()

    if (error || !data) return reply.status(404).send({ error: 'Signal not found or already resolved' })
    return { data }
  })
}
