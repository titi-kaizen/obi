import axios from 'axios'
import * as cheerio from 'cheerio'
import type { ScrapedItem } from '../worker'

const DEFAULT_ARTICLE_SELECTOR = 'article, .article, .post, .news-item, .entry'
const DEFAULT_LINK_SELECTOR = 'a[href]'
const DEFAULT_TITLE_SELECTOR = 'h1, h2, h3, .title, .headline'

export async function scrapeHTML(
  url: string,
  selector?: string
): Promise<ScrapedItem[]> {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'OGASCI/1.0 (+https://ogasci.com)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
    maxRedirects: 5,
  })

  const $ = cheerio.load(response.data as string)
  const baseUrl = new URL(url)
  const items: ScrapedItem[] = []

  const containerSelector = selector ?? DEFAULT_ARTICLE_SELECTOR
  const containers = $(containerSelector)

  if (containers.length === 0) {
    // Fallback: scrape all links that look like article URLs
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return

      const absoluteUrl = resolveUrl(href, baseUrl)
      if (!absoluteUrl || !looksLikeArticleUrl(absoluteUrl)) return

      const title = $(el).text().trim()
      if (title.length < 10) return

      items.push({
        url:          absoluteUrl,
        title,
        content:      '',
        published_at: null,
      })
    })
  } else {
    containers.each((_, container) => {
      const $container = $(container)

      const linkEl = $container.find(DEFAULT_LINK_SELECTOR).first()
      const href = linkEl.attr('href')
      if (!href) return

      const absoluteUrl = resolveUrl(href, baseUrl)
      if (!absoluteUrl) return

      const title = $container.find(DEFAULT_TITLE_SELECTOR).first().text().trim()
        || linkEl.text().trim()

      const content = $container.find('p').map((_, p) => $(p).text().trim()).get().join(' ')

      const dateEl = $container.find('time, .date, .published').first()
      const published_at = dateEl.attr('datetime') ?? dateEl.text().trim() ?? null

      items.push({
        url: absoluteUrl,
        title: title || 'Sin título',
        content,
        published_at: normalizeDate(published_at),
      })
    })
  }

  // Deduplicate by URL
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function resolveUrl(href: string, base: URL): string | null {
  try {
    if (href.startsWith('http')) return href
    if (href.startsWith('/')) return `${base.protocol}//${base.host}${href}`
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function looksLikeArticleUrl(url: string): boolean {
  const lower = url.toLowerCase()
  // Must be same domain or contain article-like path patterns
  return /\/(nota|noticia|articulo|news|article|post|blog)\//i.test(lower)
    || /\/\d{4}\/\d{2}\//.test(lower)  // date-based paths
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  try {
    return new Date(raw).toISOString()
  } catch {
    return null
  }
}
