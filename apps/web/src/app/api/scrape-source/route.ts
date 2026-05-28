import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { scrapeRSS, scrapeHTML, urlHash, titleHash } from '@/lib/inline-scraper'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { sourceId } = await request.json()
    if (!sourceId) return NextResponse.json({ error: 'sourceId requerido' }, { status: 400 })

    const db = createServerClient()
    const { data: source, error } = await db
      .from('sources')
      .select('id, name, url, type, selector')
      .eq('id', sourceId)
      .single()

    if (error || !source) return NextResponse.json({ error: 'Fuente no encontrada' }, { status: 404 })

    if (source.type === 'playwright') {
      return NextResponse.json({ ok: false, error: 'Fuente playwright requiere el worker local' }, { status: 422 })
    }

    const { newCount, skippedCount, total } = await runScrape(db, source)

    return NextResponse.json({ ok: true, newCount, skippedCount, total, sourceName: source.name })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function runScrape(
  db: ReturnType<typeof createServerClient>,
  source: { id: string; name: string; url: string; type: string; selector: string | null }
) {
  const { data: log } = await db
    .from('scrape_logs')
    .insert({ source_id: source.id, status: 'running' })
    .select('id')
    .single()

  let items
  try {
    items = source.type === 'rss'
      ? await scrapeRSS(source.url)
      : await scrapeHTML(source.url, source.selector ?? undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await Promise.all([
      db.from('sources').update({ last_error: msg }).eq('id', source.id),
      log && db.from('scrape_logs').update({ status: 'failed', error_message: msg, finished_at: new Date().toISOString() }).eq('id', log.id),
    ])
    throw err
  }

  const withHashes = items.map(item => ({
    ...item,
    urlHash:   urlHash(item.url),
    titleHash: item.title ? titleHash(item.title) : null,
  }))

  const { data: existing } = await db
    .from('articles')
    .select('url_hash')
    .in('url_hash', withHashes.map(i => i.urlHash))

  const seenUrls  = new Set((existing ?? []).map((r: { url_hash: string }) => r.url_hash))
  const seenTitles = new Set<string>()

  const toInsert = []
  let skippedCount = 0

  for (const item of withHashes) {
    if (seenUrls.has(item.urlHash)) { skippedCount++; continue }
    if (item.titleHash && seenTitles.has(item.titleHash)) { skippedCount++; continue }
    seenUrls.add(item.urlHash)
    if (item.titleHash) seenTitles.add(item.titleHash)
    toInsert.push({
      source_id:    source.id,
      url:          item.url,
      url_hash:     item.urlHash,
      title:        item.title,
      content:      item.content,
      published_at: item.published_at,
      status:       'pending',
    })
  }

  let newCount = 0
  if (toInsert.length > 0) {
    const { data: inserted } = await db
      .from('articles')
      .upsert(toInsert, { onConflict: 'url_hash', ignoreDuplicates: true })
      .select('id')
    newCount = inserted?.length ?? 0
    skippedCount += toInsert.length - newCount
  }

  await Promise.all([
    db.from('sources').update({
      last_scraped_at: new Date().toISOString(),
      last_error: null,
      error_count: 0,
    }).eq('id', source.id),
    log && db.from('scrape_logs').update({
      status: 'success',
      articles_found:   items.length,
      articles_new:     newCount,
      articles_skipped: skippedCount,
      finished_at:      new Date().toISOString(),
    }).eq('id', log.id),
  ])

  return { newCount, skippedCount, total: items.length }
}
