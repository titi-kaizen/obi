import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { scrapeRSS, scrapeHTML, tryRSSFeed, urlHash, titleHash } from '@/lib/inline-scraper'

export const maxDuration = 60

type Source = {
  id: string
  name: string
  url: string
  source_type: string
  selector: string | null
  error_count: number
}

// GET: called by Vercel Cron every 30 min
export async function GET() {
  return scrapeAllActive()
}

// POST: called manually — body {} = all sources, { sourceIds: [...] } = specific
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const sourceIds: string[] = body?.sourceIds ?? []
    return sourceIds.length > 0 ? scrapeSpecific(sourceIds) : scrapeAllActive()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function scrapeAllActive() {
  const db = createServerClient()
  const { data: sources, error } = await db
    .from('sources_v2')
    .select('id, name, url, source_type, selector, error_count')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(15)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sources?.length) return NextResponse.json({ error: 'No hay fuentes activas en sources_v2' }, { status: 404 })

  const runnableSources = (sources as Source[]).filter(s => s.source_type !== 'playwright')
  const results = await Promise.allSettled(runnableSources.map(s => runScrape(db, s)))

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ ok: true, total: runnableSources.length, succeeded, failed })
}

async function scrapeSpecific(sourceIds: string[]) {
  const db = createServerClient()
  const { data: sources, error } = await db
    .from('sources_v2')
    .select('id, name, url, source_type, selector, error_count')
    .in('id', sourceIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sources?.length) return NextResponse.json({ error: 'No se encontraron fuentes' }, { status: 404 })

  const runnableSources = (sources as Source[]).filter(s => s.source_type !== 'playwright')
  const results = await Promise.allSettled(runnableSources.map(s => runScrape(db, s)))

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    ok: true,
    total: runnableSources.length,
    succeeded,
    failed,
    skippedPlaywright: sources.length - runnableSources.length,
  })
}

async function runScrape(
  db: ReturnType<typeof createServerClient>,
  source: Source,
) {
  const t0 = Date.now()

  const { data: log } = await db
    .from('scrape_logs_v2')
    .insert({ source_id: source.id, source_name: source.name, status: 'running' })
    .select('id')
    .single()

  let items: Awaited<ReturnType<typeof scrapeHTML>>
  let usedMethod = source.source_type === 'rss' ? 'rss' : 'html'
  try {
    if (source.source_type === 'rss') {
      items = await scrapeRSS(source.url)
    } else {
      // Try quick WordPress RSS discovery first — much more reliable than HTML scraping
      items = await tryRSSFeed(source.url)
      if (items.length > 0) {
        usedMethod = 'rss'
      } else {
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
      scrape_method: usedMethod,
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
