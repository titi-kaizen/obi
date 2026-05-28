import { createHash } from 'crypto'

/**
 * Generates a stable hash for a URL to use as deduplication key.
 * Normalizes the URL before hashing (strips tracking params, AMP paths, etc.)
 */
export function deduplicateUrl(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl)
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Generates a stable hash for a title to catch syndicated duplicates.
 * Strips punctuation, extra spaces, and lowercases before hashing.
 */
export function deduplicateTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')                       // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(normalized).digest('hex')
}

function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)

    // Remove common tracking query params
    const TRACKING_PARAMS = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source', 'via', 'cid', 'mc_cid', 'mc_eid',
    ]
    for (const param of TRACKING_PARAMS) {
      url.searchParams.delete(param)
    }

    // Normalize: lowercase host
    url.hostname = url.hostname.toLowerCase()

    // Strip AMP subdomains and paths (amp.site.com → site.com, /amp/path → /path)
    url.hostname = url.hostname.replace(/^amp\./, '')
    url.pathname = url.pathname.replace(/^\/amp\//, '/').replace(/\/amp$/, '')

    // Remove trailing slash from path
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1)
    }

    // Remove fragment (anchor)
    url.hash = ''

    return url.toString()
  } catch {
    return rawUrl.toLowerCase().trim()
  }
}
