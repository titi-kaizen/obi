import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { scrapeRSS, scrapeHTML, tryRSSFeed, urlHash, titleHash } from '@/lib/inline-scraper'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { sourceId } = await request.json()
    if (!sourceId) return NextResponse.json({ error: 'sourceId requerido' }, { status: 400 })

    const db = createServerClient()
    const { data: source, error } = await db
      .from('sources_v2')
      .select('id, name, url, source_type, selector, error_count')
      .eq('id', sourceId)
      .single()

    if (error || !source) return NextResponse.json({ error: 'Fuente no encontrada' }, { status: 404 })

    if (source.source_type === 'playwright') {
      return NextResponse.json({ ok: false, error: 'Fuente playwright no soportada en el scraper inline' }, { status: 422 })
    }

    const { newCount, skippedCount, total } = await runScrape(db, source)
    return NextResponse.json({ ok: true, newCount, skippedCount, total, sourceName: source.name })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function runScrape(
  db: ReturnType<typeof createServerClient>,
  source: { id: string; name: string; url: string; source_type: string; selector: string | null; error_count: number },
) {
  const t0 = Date.now()

  const { data: log } = await db
    .from('scrape_logs_v2')
    .insert({ source_id: source.id, source_name: source.name, status: 'running' })
    .select('id')
    .single()

  let items: Awaited<ReturnType<typeof scrapeHTML>>
  try {
    if (source.source_type === 'rss') {
      items = await scrapeRSS(source.url)
    } else {
      items = await tryRSSFeed(source.url)
      if (items.length === 0) {
        items = await scrapeHTML(source.url, source.selector ?? undefined)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const duration = Date.now() - t0
    await Promise.all([
      db.from('sources_v2').update({
        last_error: msg.slice(0, 500),
        error_count: (source.error_count ?? 0) + 1,
      }).eq('id', source.id),
      log && db.from('scrape_logs_v2').update({
        status: 'failed',
        error_message: msg.slice(0, 500),
        finished_at: new Date().toISOString(),
        duration_ms: duration,
      }).eq('id', log.id),
    ])
    throw err
  }

  const withHashes = items.map(item => ({
    ...item,
    urlHash:   urlHash(item.url),
    titleHash: item.title ? titleHash(item.title) : null,
  }))

  const { data: existing } = await db
    .from('articles_v2')
    .select('url_hash')
    .in('url_hash', withHashes.map(i => i.urlHash))

  const seenUrls   = new Set((existing ?? []).map((r: { url_hash: string }) => r.url_hash))
  const seenTitles = new Set<string>()
  const toInsert: object[] = []
  let skippedCount = 0

  for (const item of withHashes) {
    if (seenUrls.has(item.urlHash)) { skippedCount++; continue }
    if (item.titleHash && seenTitles.has(item.titleHash)) { skippedCount++; continue }
    seenUrls.add(item.urlHash)
    if (item.titleHash) seenTitles.add(item.titleHash)
    toInsert.push({
      source_id:    source.id,
      source_name:  source.name,
      url:          item.url,
      url_hash:     item.urlHash,
      title:        item.title,
      content:      item.content,
      published_at: item.published_at,
      status:       'scraped',
      scrape_method: source.source_type === 'rss' ? 'rss' : 'html',
    })
  }

  let newCount = 0
  if (toInsert.length > 0) {
    const { data: inserted } = await db
      .from('articles_v2')
      .upsert(toInsert, { onConflict: 'url_hash', ignoreDuplicates: true })
      .select('id')
    newCount = inserted?.length ?? 0
    skippedCount += toInsert.length - newCount
  }

  const duration = Date.now() - t0

  await Promise.all([
    db.from('sources_v2').update({
      last_scraped_at: new Date().toISOString(),
      last_error: null,
      error_count: 0,
    }).eq('id', source.id),
    log && db.from('scrape_logs_v2').update({
      status: 'success',
      articles_found:   items.length,
      articles_new:     newCount,
      articles_skipped: skippedCount,
      finished_at:      new Date().toISOString(),
      duration_ms:      duration,
    }).eq('id', log.id),
  ])

  return { newCount, skippedCount, total: items.length }
}
