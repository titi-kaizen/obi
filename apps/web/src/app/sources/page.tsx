import { createServerClient } from '@/lib/supabase'
import SourcesClient from './SourcesClient'

async function getSources() {
  const db = createServerClient()
  const { data } = await db.from('sources').select('*').order('name')
  return data ?? []
}

async function getArticleCountsBySource() {
  const db = createServerClient()
  const { data } = await db.from('articles').select('source_id')
  if (!data) return {}
  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.source_id] = (counts[row.source_id] ?? 0) + 1
  }
  return counts
}

export default async function SourcesPage() {
  const [sources, counts] = await Promise.all([getSources(), getArticleCountsBySource()])
  return <SourcesClient sources={sources as any} counts={counts} />
}
