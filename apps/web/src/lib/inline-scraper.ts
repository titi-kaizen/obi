import { createHash } from 'crypto'
import Parser from 'rss-parser'

export interface ScrapedItem {
  url: string
  title: string
  content: string
  published_at: string | null
}

const rssParser = new Parser({
  timeout: 10000,
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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(normalized).digest('hex')
}

export async function scrapeRSS(url: string): Promise<ScrapedItem[]> {
  const feed = await rssParser.parseURL(url)
  return feed.items
    .filter(item => item.link)
    .map(item => ({
      url:          item.link!,
      title:        item.title ?? '',
      content:      item.contentSnippet ?? item.summary ?? item.content ?? '',
      published_at: item.isoDate ?? item.pubDate ?? null,
    }))
}

export async function scrapeHTML(url: string, selector?: string): Promise<ScrapedItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':     'OGAS/1.0',
      'Accept':         'text/html',
      'Accept-Language':'es-AR,es;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  })
  const html = await res.text()
  const base = new URL(url)

  // Extract all <a> tags with href
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const seen = new Set<string>()
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

    if (seen.has(absUrl)) continue
    if (!looksLikeArticle(absUrl)) continue
    seen.add(absUrl)

    items.push({ url: absUrl, title, content: '', published_at: null })
  }

  return items
}

function looksLikeArticle(url: string): boolean {
  return /\/(nota|noticia|articulo|news|article|post|blog)\//i.test(url)
    || /\/\d{4}\/\d{2}\//.test(url)
}
