import Groq from 'groq-sdk'
import { AI_MODELS, BRIEF_MIN_ARTICLES } from '@ogasci/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { BRIEF_SYSTEM_PROMPT, buildBriefPrompt, type BriefContext } from './prompts'

const client = new Groq({ apiKey: process.env['GROQ_API_KEY'] })

export async function generateBrief(
  supabase: SupabaseClient,
  date: string,
  logger: Logger
): Promise<{ content: string; articlesAnalyzed: number }> {
  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay   = `${date}T23:59:59.999Z`

  // Fetch articles for the day
  const { data: articles, error: articlesError } = await supabase
    .from('articles')
    .select('id, title, summary, category, sentiment, relevance_score, url, published_at')
    .eq('status', 'done')
    .gte('published_at', startOfDay)
    .lte('published_at', endOfDay)
    .gte('relevance_score', 0.3)
    .order('relevance_score', { ascending: false })
    .limit(50)

  if (articlesError) throw new Error(articlesError.message)

  const articleList = articles ?? []

  if (articleList.length < BRIEF_MIN_ARTICLES) {
    throw new Error(
      `Insufficient articles for brief: ${articleList.length} found (minimum: ${BRIEF_MIN_ARTICLES})`
    )
  }

  logger.info({ date, articleCount: articleList.length }, 'Generating brief with Groq')

  // Fetch active signals for the day
  const { data: signals } = await supabase
    .from('signals')
    .select('type, title, severity')
    .eq('status', 'active')
    .gte('detected_at', startOfDay)
    .order('severity', { ascending: false })
    .limit(10)

  // Get top entities mentioned today
  const articleIds = articleList.map((a: { id: string }) => a.id)

  const { data: entityData } = await supabase
    .from('article_entities')
    .select('entity:entities(name, type)')
    .in('article_id', articleIds)
    .limit(500)

  // Count entity mentions
  const entityFreq: Record<string, { name: string; type: string; count: number }> = {}
  for (const row of entityData ?? []) {
    const entity = row.entity as { name: string; type: string } | null
    if (!entity) continue
    const key = entity.name
    if (!entityFreq[key]) entityFreq[key] = { name: entity.name, type: entity.type, count: 0 }
    entityFreq[key].count++
  }

  const topEntities = Object.values(entityFreq)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  const ctx: BriefContext = {
    date,
    articles: articleList.map((a: {
      title: string | null; summary: string | null; category: string | null
      sentiment: string | null; relevance_score: number | null; url: string; published_at: string | null
    }) => ({
      title:         a.title ?? 'Sin título',
      summary:       a.summary ?? '',
      category:      a.category ?? 'other',
      sentiment:     a.sentiment ?? 'neutral',
      relevanceScore: a.relevance_score ?? 0,
      url:           a.url,
      publishedAt:   a.published_at,
    })),
    topEntities,
    activeSignals: (signals ?? []).map((s: { type: string; title: string; severity: string }) => ({
      type:     s.type,
      title:    s.title,
      severity: s.severity,
    })),
  }

  // Call Groq
  const completion = await client.chat.completions.create({
    model:      AI_MODELS.BRIEF,
    max_tokens: 4096,
    temperature: 0.4,
    messages: [
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: buildBriefPrompt(ctx) },
    ],
  })

  const content = completion.choices[0]?.message?.content ?? ''
  if (!content) throw new Error('No response from Groq')

  return {
    content,
    articlesAnalyzed: articleList.length,
  }
}
