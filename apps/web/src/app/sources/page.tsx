import { createServerClient } from '@/lib/supabase'
import SourcesClient from './SourcesClient'

export const dynamic = 'force-dynamic'

async function getSources() {
  const db = createServerClient()
  const { data: v2 } = await db
    .from('sources_v2')
    .select('id, name, url, source_type, source_category, priority, scrape_interval_minutes, is_active, last_scraped_at, last_error, error_count')
    .order('priority', { ascending: false })
  if (v2 && v2.length > 0) return v2
  const { data } = await db.from('sources').select('*').order('name')
  return data ?? []
}

async function getArticleCountsBySource() {
  const db = createServerClient()
  const { data: v2 } = await db.from('articles_v2').select('source_id').eq('status', 'completed')
  if (v2 && v2.length > 0) {
    const counts: Record<string, number> = {}
    for (const row of v2) counts[row.source_id] = (counts[row.source_id] ?? 0) + 1
    return counts
  }
  const { data } = await db.from('articles').select('source_id')
  if (!data) return {}
  const counts: Record<string, number> = {}
  for (const row of data) counts[row.source_id] = (counts[row.source_id] ?? 0) + 1
  return counts
}

export default async function SourcesPage() {
  const [sources, counts] = await Promise.all([getSources(), getArticleCountsBySource()])
  return <SourcesClient sources={sources as any} counts={counts} />
}
