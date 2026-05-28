import type { FastifyPluginAsync } from 'fastify'

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/dashboard/kpis
  fastify.get('/dashboard/kpis', {
    preHandler: [fastify.authenticate],
    schema: { tags: ['Dashboard'] },
  }, async (_request, reply) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [todayRes, weekRes, signalsRes, sourcesRes, avgRes, topCatRes] = await Promise.all([
      fastify.supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .gte('scraped_at', today.toISOString()),
      fastify.supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .gte('scraped_at', weekAgo.toISOString()),
      fastify.supabase
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      fastify.supabase
        .from('sources')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      fastify.supabase
        .from('articles')
        .select('relevance_score')
        .eq('status', 'done')
        .gte('processed_at', weekAgo.toISOString())
        .not('relevance_score', 'is', null),
      fastify.supabase
        .from('articles')
        .select('category')
        .eq('status', 'done')
        .gte('processed_at', today.toISOString())
        .not('category', 'is', null),
    ])

    // Calculate avg relevance
    const scores = (avgRes.data ?? []).map((a: { relevance_score: number }) => a.relevance_score)
    const avg_relevance = scores.length
      ? scores.reduce((s: number, v: number) => s + v, 0) / scores.length
      : 0

    // Find top category today
    const catFreq: Record<string, number> = {}
    for (const a of topCatRes.data ?? []) {
      if (a.category) catFreq[a.category] = (catFreq[a.category] ?? 0) + 1
    }
    const top_category = Object.entries(catFreq).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

    return {
      data: {
        articles_today:    todayRes.count ?? 0,
        articles_week:     weekRes.count ?? 0,
        active_signals:    signalsRes.count ?? 0,
        sources_active:    sourcesRes.count ?? 0,
        avg_relevance_score: Math.round(avg_relevance * 100) / 100,
        top_category,
      },
    }
  })

  // GET /api/dashboard/trends
  fastify.get<{ Querystring: { days?: number } }>('/dashboard/trends', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 14 } },
      },
    },
  }, async (request, reply) => {
    const days = request.query.days ?? 14
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await fastify.supabase
      .from('articles')
      .select('published_at, relevance_score')
      .eq('status', 'done')
      .gte('published_at', since)
      .not('published_at', 'is', null)
      .order('published_at')

    if (error) return reply.status(500).send({ error: error.message })

    // Group by date
    const byDate: Record<string, { count: number; scores: number[] }> = {}
    for (const article of data ?? []) {
      const date = (article.published_at as string).slice(0, 10)
      if (!byDate[date]) byDate[date] = { count: 0, scores: [] }
      byDate[date].count++
      if (article.relevance_score) byDate[date].scores.push(article.relevance_score as number)
    }

    const trends = Object.entries(byDate).map(([date, { count, scores }]) => ({
      date,
      count,
      avg_relevance: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : 0,
    }))

    return { data: trends }
  })

  // GET /api/dashboard/companies
  fastify.get<{ Querystring: { limit?: number; days?: number } }>('/dashboard/companies', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          days:  { type: 'integer', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = 10, days = 7 } = request.query
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await fastify.supabase
      .from('article_entities')
      .select('entity:entities(id, name, type, mention_count), article:articles(published_at)')
      .eq('entity.type', 'company')
      .gte('article.published_at', since)
      .not('entity', 'is', null)
      .limit(1000)

    if (error) return reply.status(500).send({ error: error.message })

    // Count per company
    const freq: Record<string, { name: string; count: number }> = {}
    for (const row of data ?? []) {
      const entity = row.entity as { id: string; name: string } | null
      if (!entity) continue
      if (!freq[entity.id]) freq[entity.id] = { name: entity.name, count: 0 }
      freq[entity.id].count++
    }

    const companies = Object.values(freq)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    return { data: companies }
  })
}
