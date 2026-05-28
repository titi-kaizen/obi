import type { ScrapedItem } from '../worker'

const ENABLE_DYNAMIC = process.env['ENABLE_DYNAMIC_SCRAPING'] !== 'false'

export async function scrapePlaywright(
  url: string,
  selector?: string
): Promise<ScrapedItem[]> {
  if (!ENABLE_DYNAMIC) {
    // Fallback to HTML scraper when Playwright is disabled
    const { scrapeHTML } = await import('./html')
    return scrapeHTML(url, selector)
  }

  const { chromium } = await import('playwright')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const context = await browser.newContext({
      userAgent: 'OGASCI/1.0 (+https://ogasci.com)',
      locale: 'es-AR',
      extraHTTPHeaders: { 'Accept-Language': 'es-AR,es;q=0.9' },
    })

    const page = await context.newPage()

    // Block images/fonts/media to speed up scraping
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,mp3}', (route) => {
      route.abort()
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // Wait for content to be visible
    const containerSelector = selector ?? 'article, .article, .post, .news-item, [class*="article"]'
    await page.waitForSelector(containerSelector, { timeout: 10000 }).catch(() => {})

    // Extract articles
    const items = await page.evaluate((sel: string) => {
      const results: Array<{ url: string; title: string; content: string; published_at: string | null }> = []
      const baseUrl = window.location.origin

      document.querySelectorAll(sel).forEach((container) => {
        const link = container.querySelector('a[href]') as HTMLAnchorElement | null
        if (!link) return

        let href = link.getAttribute('href') ?? ''
        if (!href) return
        if (!href.startsWith('http')) href = baseUrl + (href.startsWith('/') ? '' : '/') + href

        const titleEl = container.querySelector('h1, h2, h3, .title, .headline')
        const title = titleEl?.textContent?.trim() ?? link.textContent?.trim() ?? ''
        if (title.length < 5) return

        const paragraphs = Array.from(container.querySelectorAll('p'))
          .map((p) => p.textContent?.trim() ?? '')
          .filter((t) => t.length > 0)
          .join(' ')

        const timeEl = container.querySelector('time, [class*="date"], [class*="published"]')
        const published_at = timeEl?.getAttribute('datetime') ?? null

        results.push({ url: href, title, content: paragraphs, published_at })
      })

      return results
    }, containerSelector)

    await context.close()

    // Deduplicate
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.url)) return false
      seen.add(item.url)
      return true
    })
  } finally {
    await browser.close()
  }
}
