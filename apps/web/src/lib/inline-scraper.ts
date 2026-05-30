import { createHash } from 'crypto'
import Parser from 'rss-parser'

export interface ScrapedItem {
  url: string
  title: string
  content: string
  published_at: string | null
}

const rssParser = new Parser({
  timeout: 6000,
  headers: {
    'User-Agent': 'OGAS/1.0',
    'Accept':     'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
})

export function urlHash(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const TRACKING = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid']
    TRACKING.forEach(p => url.searchParams.delete(p))
    url.hostname = url.hostname.toLowerCase().replace(/^amp\./, '')
    url.pathname = url.pathname.replace(/^\/amp\//, '/').replace(/\/amp$/, '')
    if (url.pathname.endsWith('/') && url.pathname.length > 1) url.pathname = url.pathname.slice(0, -1)
    url.hash = ''
    return createHash('sha256').update(url.toString()).digest('hex')
  } catch {
    return createHash('sha256').update(rawUrl.toLowerCase().trim()).digest('hex')
  }
}

export function titleHash(title: string): string {
  const normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(normalized).digest('hex')
}

function mapFeedItems(feed: Awaited<ReturnType<typeof rssParser.parseURL>>): ScrapedItem[] {
  return feed.items
    .filter(item => item.link)
    .map(item => ({
      url:          item.link!,
      title:        item.title ?? '',
      content:      item.contentSnippet ?? item.summary ?? item.content ?? '',
      published_at: item.isoDate ?? item.pubDate ?? null,
    }))
}

export async function scrapeRSS(url: string): Promise<ScrapedItem[]> {
  // Try the URL as-is first (for sources where url IS the feed URL)
  try {
    const feed = await rssParser.parseURL(url)
    if (feed.items.length > 0) return mapFeedItems(feed)
  } catch { /* not a feed — try fallback patterns */ }

  // Try common RSS feed URL patterns (WordPress and others)
  try {
    const origin = new URL(url).origin
    for (const suffix of ['/feed/', '/rss', '/rss.xml', '/feed']) {
      try {
        const feed = await rssParser.parseURL(origin + suffix)
        if (feed.items.length > 0) return mapFeedItems(feed)
      } catch { /* try next pattern */ }
    }
  } catch { /* invalid URL */ }

  return []
}

/**
 * Quick check for WordPress /feed/ — single request, fast.
 * For HTML sources, try this before falling back to full HTML scrape.
 */
export async function tryRSSFeed(url: string): Promise<ScrapedItem[]> {
  try {
    const origin = new URL(url).origin
    const feed = await rssParser.parseURL(origin + '/feed/')
    return feed.items.length > 0 ? mapFeedItems(feed) : []
  } catch {
    return []
  }
}

export async function scrapeHTML(url: string, selector?: string): Promise<ScrapedItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (compatible; OGAS/1.0; +https://obi.energy)',
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  })
  const html = await res.text()
  const base = new URL(url)

  // Extract all <a> tags with href
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const seen   = new Set<string>()
  const items: ScrapedItem[] = []
  let m: RegExpExecArray | null

  while ((m = linkRe.exec(html)) !== null) {
    const [, href, inner] = m
    const title = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (title.length < 12) continue

    let absUrl: string
    try {
      absUrl = href.startsWith('http') ? href : new URL(href, base).toString()
    } catch { continue }

    // Only same-domain links
    try {
      if (new URL(absUrl).hostname !== base.hostname) continue
    } catch { continue }

    if (seen.has(absUrl)) continue
    if (!looksLikeArticle(absUrl)) continue
    seen.add(absUrl)

    items.push({ url: absUrl, title, content: '', published_at: null })
  }

  return items
}

function looksLikeArticle(url: string): boolean {
  // Must not be a navigation/category page
  if (/\/(tag|tags|categoria|category|author|autor|page|pagina|seccion|section|tema|etiqueta|archivo|archive|buscar|search|galeria|gallery|video|podcast)\/?$/i.test(url)) return false

  return (
    // Known article path segments
    /\/(nota|noticia|articulo|news|article|post|blog|novedad|novedades|prensa|comunicado|sala-de-prensa|press-release)\//i.test(url)
    // Date-based URLs (/2024/05/ or /2024/05/15/)
    || /\/\d{4}\/\d{2}\//.test(url)
    // ID-based patterns: -id-123, -art-123, -nota-123
    || /-(id|art|nota)-\d+/i.test(url)
    // WordPress page IDs: /p/123
    || /\/p\/\d+/.test(url)
    // Infobae/Ámbito style: title-n1234567
    || /-n\d{5,}(\/|$)/i.test(url)
    // Numeric article IDs at end: title-12345678 or /12345678/
    || /(\/|-)\d{6,}(\/|-|$)/.test(url)
    // Long slugs with at least 3 path segments (depth heuristic)
    || (() => { try { return new URL(url).pathname.split('/').filter(Boolean).length >= 3 } catch { return false } })()
  )
}
