import type { FastifyPluginAsync } from 'fastify'

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/search?q=vaca+muerta
  fastify.get<{ Querystring: { q: string; page?: number; limit?: number; category?: string } }>('/search', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Search'],
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q:        { type: 'string', minLength: 2 },
          page:     { type: 'integer', minimum: 1, default: 1 },
          limit:    { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          category: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { q, page = 1, limit = 20, category } = request.query

    // PostgreSQL full-text search in Spanish
    let query = fastify.supabase
      .from('articles')
      .select('id, title, summary, url, published_at, category, sentiment, relevance_score, source:sources(name)', { count: 'exact' })
      .textSearch('fts', q, { type: 'websearch', config: 'spanish' })
      .eq('status', 'done')
      .order('relevance_score', { ascending: false, nullsFirst: false })
      .range((page - 1) * limit, page * limit - 1)

    if (category) query = query.eq('category', category)

    const { data, error, count } = await query
    if (error) return reply.status(500).send({ error: error.message })

    // Log the search query for trending analytics
    fastify.supabase
      .from('search_logs')
      .insert({ query: q, results_count: count ?? 0, user_id: request.user.id })
      .then(() => {})
      .catch(() => {})

    return {
      data: data ?? [],
      query: q,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    }
  })

  // GET /api/search/trending
  fastify.get('/search/trending', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Search'] },
  }, async (_request, reply) => {
    // Top keywords from articles in the last 7 days
    const { data, error } = await fastify.supabase
      .from('articles')
      .select('keywords')
      .eq('status', 'done')
      .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .not('keywords', 'eq', '{}')
      .limit(500)

    if (error) return reply.status(500).send({ error: error.message })

    // Count keyword frequency
    const freq: Record<string, number> = {}
    for (const article of data ?? []) {
      for (const kw of (article.keywords as string[] ?? [])) {
        freq[kw] = (freq[kw] ?? 0) + 1
      }
    }

    const trending = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([keyword, count]) => ({ keyword, count }))

    return { data: trending }
  })
}
