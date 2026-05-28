import type { FastifyPluginAsync } from 'fastify'

export const articlesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/articles
  fastify.get('/articles', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Articles'],
      querystring: {
        type: 'object',
        properties: {
          page:        { type: 'integer', minimum: 1, default: 1 },
          limit:       { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          category:    { type: 'string' },
          status:      { type: 'string', enum: ['pending', 'processing', 'done', 'failed'] },
          sentiment:   { type: 'string', enum: ['positive', 'negative', 'neutral'] },
          source_id:   { type: 'string' },
          date_from:   { type: 'string', format: 'date' },
          date_to:     { type: 'string', format: 'date' },
          min_relevance: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const q = request.query as {
      page: number; limit: number; category?: string; status?: string
      sentiment?: string; source_id?: string; date_from?: string
      date_to?: string; min_relevance?: number
    }
    const { page, limit, category, status, sentiment, source_id, date_from, date_to, min_relevance } = q

    let query = fastify.supabase
      .from('articles')
      .select('*, source:sources(name, url, type)', { count: 'exact' })
      .order('published_at', { ascending: false, nullsFirst: false })
      .range((page - 1) * limit, page * limit - 1)

    if (category)      query = query.eq('category', category)
    if (status)        query = query.eq('status', status)
    if (sentiment)     query = query.eq('sentiment', sentiment)
    if (source_id)     query = query.eq('source_id', source_id)
    if (date_from)     query = query.gte('published_at', date_from)
    if (date_to)       query = query.lte('published_at', date_to + 'T23:59:59Z')
    if (min_relevance) query = query.gte('relevance_score', min_relevance)

    const { data, error, count } = await query
    if (error) return reply.status(500).send({ error: error.message })

    return {
      data,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    }
  })

  // GET /api/articles/:id
  fastify.get<{ Params: { id: string } }>('/articles/:id', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Articles'] },
  }, async (request, reply) => {
    const { id } = request.params

    const [articleRes, entitiesRes] = await Promise.all([
      fastify.supabase
        .from('articles')
        .select('*, source:sources(name, url, type)')
        .eq('id', id)
        .single(),
      fastify.supabase
        .from('article_entities')
        .select('*, entity:entities(*)')
        .eq('article_id', id),
    ])

    if (articleRes.error || !articleRes.data) {
      return reply.status(404).send({ error: 'Article not found' })
    }

    return { data: { ...articleRes.data, entities: entitiesRes.data ?? [] } }
  })

  // GET /api/articles/:id/similar
  fastify.get<{ Params: { id: string }; Querystring: { limit?: number } }>('/articles/:id/similar', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Articles'],
      querystring: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const limit = request.query.limit ?? 5

    // Get the article's embedding
    const { data: article, error } = await fastify.supabase
      .from('articles')
      .select('embedding')
      .eq('id', id)
      .single()

    if (error || !article) return reply.status(404).send({ error: 'Article not found' })
    if (!article.embedding) return { data: [] }

    // Use pgvector similarity function
    const { data, error: matchError } = await fastify.supabase.rpc('match_articles', {
      query_embedding: article.embedding,
      match_threshold: 0.6,
      match_count: limit + 1,  // +1 to exclude the article itself
    })

    if (matchError) return reply.status(500).send({ error: matchError.message })

    const similar = (data ?? []).filter((a: { id: string }) => a.id !== id).slice(0, limit)
    return { data: similar }
  })
}
