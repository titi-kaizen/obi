import Parser from 'rss-parser'
import type { ScrapedItem } from '../worker'

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent':  'OGASCI/1.0 (+https://ogasci.com)',
    'Connection':  'keep-alive',
    'Accept':      'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
})

export async function scrapeRSS(url: string): Promise<ScrapedItem[]> {
  const feed = await parser.parseURL(url)

  return feed.items
    .filter((item) => item.link)
    .map((item) => ({
      url:          item.link!,
      title:        item.title ?? '',
      content:      item.contentSnippet ?? item.summary ?? item.content ?? '',
      published_at: item.isoDate ?? item.pubDate ?? null,
    }))
}
