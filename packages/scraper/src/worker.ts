import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { QUEUES, MAX_SCRAPE_RETRIES } from '@ogasci/shared'
import type { ScrapeJob, ProcessArticleJob } from '@ogasci/shared'
import { scrapeRSS } from './scrapers/rss'
import { scrapeHTML } from './scrapers/html'
import { scrapePlaywright } from './scrapers/playwright'
import { deduplicateUrl, deduplicateTitle } from './lib/deduplication'

export interface ScrapedItem {
  url: string
  title: string
  content: string
  published_at: string | null
}

export function createScrapeWorker(logger: Logger) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const supabaseUrl = process.env['SUPABASE_URL']!
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const processQueue = new Queue(QUEUES.PROCESS_ARTICLE, { connection })

  const worker = new Worker<ScrapeJob>(
    QUEUES.SCRAPE,
    async (job: Job<ScrapeJob>) => {
      const { sourceId, sourceName, sourceUrl, sourceType, selector } = job.data
      const log = logger.child({ sourceId, sourceName, job: job.id })

      log.info(`Starting scrape: ${sourceType} — ${sourceUrl}`)

      const { data: scrapeLog } = await supabase
        .from('scrape_logs')
        .insert({ source_id: sourceId, status: 'running' })
        .select('id')
        .single()

      let items: ScrapedItem[] = []

      try {
        switch (sourceType) {
          case 'rss':
            items = await scrapeRSS(sourceUrl)
            break
          case 'html':
            items = await scrapeHTML(sourceUrl, selector ?? undefined)
            break
          case 'playwright':
            items = await scrapePlaywright(sourceUrl, selector ?? undefined)
            break
        }

        log.info(`Scraped ${items.length} items from ${sourceName}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error({ err }, `Scrape failed for ${sourceName}`)

        await Promise.all([
          supabase.from('sources').update({
            last_error: message,
            error_count: supabase.rpc('increment_error_count' as any, { source_id: sourceId }),
          }).eq('id', sourceId),
          scrapeLog && supabase.from('scrape_logs').update({
            status: 'failed',
            error_message: message,
            finished_at: new Date().toISOString(),
          }).eq('id', scrapeLog.id),
        ])

        throw err
      }

      // ── Deduplication ────────────────────────────────────────────────────
      const itemsWithHashes = items.map(item => ({
        ...item,
        urlHash:   deduplicateUrl(item.url),
        titleHash: item.title ? deduplicateTitle(item.title) : null,
      }))

      // Single query: all URL hashes already in DB
      const urlHashes = itemsWithHashes.map(i => i.urlHash)
      const { data: existingByUrl } = await supabase
        .from('articles')
        .select('url_hash')
        .in('url_hash', urlHashes)

      const seenUrlHashes = new Set((existingByUrl ?? []).map((r: any) => r.url_hash))

      // Single query: title hashes seen in the last 7 days (syndication guard)
      const titleHashes = itemsWithHashes.map(i => i.titleHash).filter(Boolean) as string[]
      const seenTitleHashes = new Set<string>()
      if (titleHashes.length > 0) {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: existingByTitle } = await supabase
          .from('articles')
          .select('title')
          .gte('scraped_at', since)
          .not('title', 'is', null)
        for (const row of existingByTitle ?? []) {
          if (row.title) seenTitleHashes.add(deduplicateTitle(row.title))
        }
      }

      // ── Collect new articles (in-memory dedup within batch) ──────────────
      let skippedCount = 0
      const toInsert: Array<{
        source_id: string
        url: string
        url_hash: string
        title: string
        content: string
        published_at: string | null
        status: string
      }> = []

      for (const item of itemsWithHashes) {
        if (seenUrlHashes.has(item.urlHash)) { skippedCount++; continue }
        if (item.titleHash && seenTitleHashes.has(item.titleHash)) { skippedCount++; continue }

        // Track within this batch to prevent sending dupes to DB
        seenUrlHashes.add(item.urlHash)
        if (item.titleHash) seenTitleHashes.add(item.titleHash)

        toInsert.push({
          source_id:    sourceId,
          url:          item.url,
          url_hash:     item.urlHash,
          title:        item.title,
          content:      item.content,
          published_at: item.published_at,
          status:       'pending',
        })
      }

      // ── Single batch upsert (ON CONFLICT DO NOTHING for race conditions) ──
      const processJobs: Array<{ name: string; data: ProcessArticleJob }> = []
      let newCount = 0

      if (toInsert.length > 0) {
        const { data: inserted, error: bulkError } = await supabase
          .from('articles')
          .upsert(toInsert, { onConflict: 'url_hash', ignoreDuplicates: true })
          .select('id, title, content, url')

        if (bulkError) {
          log.warn({ error: bulkError.message }, 'Bulk insert error')
        }

        newCount = inserted?.length ?? 0
        skippedCount += toInsert.length - newCount // race-condition dupes

        for (const article of inserted ?? []) {
          processJobs.push({
            name: 'process-article',
            data: {
              articleId: article.id,
              title:     article.title,
              content:   article.content,
              url:       article.url,
            },
          })
        }
      }

      // Bulk enqueue process-article jobs
      if (processJobs.length > 0) {
        await processQueue.addBulk(processJobs)
      }

      // Update source + scrape log
      await Promise.all([
        supabase.from('sources').update({
          last_scraped_at: new Date().toISOString(),
          last_error: null,
          error_count: 0,
        }).eq('id', sourceId),
        scrapeLog && supabase.from('scrape_logs').update({
          status: 'success',
          articles_found:   items.length,
          articles_new:     newCount,
          articles_skipped: skippedCount,
          finished_at: new Date().toISOString(),
        }).eq('id', scrapeLog.id),
      ])

      log.info(`Scrape complete: ${newCount} new, ${skippedCount} skipped`)
      return { newCount, skippedCount, total: items.length }
    },
    {
      connection,
      concurrency: 8,
    }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Scrape job failed')
  })

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'Scrape job completed')
  })

  return worker
}
