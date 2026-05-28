import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { QUEUES, DEFAULT_SCRAPE_INTERVALS } from '@ogasci/shared'
import type { ScrapeJob } from '@ogasci/shared'

export function startScrapeScheduler(logger: Logger) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const supabase = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  )

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const queue = new Queue<ScrapeJob>(QUEUES.SCRAPE, { connection })

  const CHECK_INTERVAL_MS = 60 * 1000

  async function fetchActiveSources() {
    const { data: sources, error } = await supabase
      .from('sources')
      .select('id, name, url, type, selector, scrape_interval_minutes, last_scraped_at')
      .eq('is_active', true)

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch sources for scheduling')
      return null
    }
    return sources ?? []
  }

  async function enqueueSource(source: NonNullable<Awaited<ReturnType<typeof fetchActiveSources>>>[number], jobName: string): Promise<boolean> {
    const jobId = `scrape-${jobName}-${source.id}`
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'waiting' || state === 'active' || state === 'delayed') return false
    }
    await queue.add(
      jobName,
      {
        sourceId:   source.id,
        sourceName: source.name,
        sourceUrl:  source.url,
        sourceType: source.type,
        selector:   source.selector,
      } as ScrapeJob,
      { jobId }
    )
    return true
  }

  async function scheduleDueSources() {
    const sources = await fetchActiveSources()
    if (!sources) return

    const now = Date.now()
    let scheduled = 0

    for (const source of sources) {
      const intervalMs = (source.scrape_interval_minutes ?? DEFAULT_SCRAPE_INTERVALS[source.type as keyof typeof DEFAULT_SCRAPE_INTERVALS] ?? 60) * 60 * 1000
      const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at).getTime() : 0

      if (now - lastScraped < intervalMs) continue

      const queued = await enqueueSource(source, 'scrape-scheduled')
      if (queued) scheduled++
    }

    if (scheduled > 0) {
      logger.info({ scheduled }, 'Scrape jobs scheduled')
    }
  }

  // Morning sweep: at 7:45 AM ART (= 10:45 UTC, ART is always UTC-3, no DST)
  // Ensures all active sources are scraped before the 8 AM brief window.
  async function runMorningSweep() {
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinute = now.getUTCMinutes()

    if (!(utcHour === 10 && utcMinute >= 45)) return

    const artDate = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    const sweepKey = `morning-sweep:${artDate.toISOString().slice(0, 10)}`
    const alreadyRan = await connection.get(sweepKey)
    if (alreadyRan) return

    await connection.set(sweepKey, '1', 'EX', 86400)
    logger.info('Morning sweep started — enqueueing stale sources before 8 AM brief')

    const sources = await fetchActiveSources()
    if (!sources) return

    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
    let swept = 0

    for (const source of sources) {
      const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at).getTime() : 0
      if (lastScraped >= sixHoursAgo) continue

      const queued = await enqueueSource(source, 'scrape-sweep')
      if (queued) swept++
    }

    logger.info({ swept }, 'Morning sweep complete')
  }

  // Weekly brief: every Sunday at 20:00 ART (= 23:00 UTC Sunday)
  async function runWeeklyBrief() {
    const now = new Date()
    if (!(now.getUTCDay() === 0 && now.getUTCHours() === 23)) return

    // ISO week key: YYYY-Www
    const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7)
    const weekKey = `weekly-brief:${now.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`

    const alreadyRan = await connection.get(weekKey)
    if (alreadyRan) return

    await connection.set(weekKey, '1', 'EX', 7 * 24 * 3600)
    logger.info({ weekKey }, 'Triggering weekly brief generation')

    const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000'
    try {
      const res = await fetch(`${webUrl}/api/generate-weekly-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { ok?: boolean; error?: string; articlesAnalyzed?: number }
      if (!res.ok) throw new Error(data.error ?? 'HTTP error')
      logger.info({ articlesAnalyzed: data.articlesAnalyzed }, 'Weekly brief generated')
    } catch (err) {
      logger.error({ err }, 'Failed to generate weekly brief')
    }
  }

  async function tick() {
    await scheduleDueSources().catch(err => logger.error({ err }, 'Scheduler error'))
    await runMorningSweep().catch(err => logger.error({ err }, 'Morning sweep error'))
    await runWeeklyBrief().catch(err => logger.error({ err }, 'Weekly brief error'))
  }

  tick()

  const timer = setInterval(tick, CHECK_INTERVAL_MS)

  return {
    close: async () => {
      clearInterval(timer)
      await queue.close()
      await connection.quit()
    },
  }
}
