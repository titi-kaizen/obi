import { SIGNAL_KEYWORDS, RELEVANCE_THRESHOLDS } from '@ogasci/shared'
import type { OGCategory, SignalType, SignalSeverity } from '@ogasci/shared'

export interface DetectedSignal {
  type: SignalType
  severity: SignalSeverity
  title: string
  description: string
}

/**
 * Detects supply chain signals from article metadata.
 * Returns an array of detected signals (can be empty).
 */
export function detectSignals(params: {
  title: string
  summary: string
  category: OGCategory
  keywords: string[]
  relevanceScore: number
}): DetectedSignal[] {
  const { title, summary, category, keywords, relevanceScore } = params
  const text = `${title} ${summary}`.toLowerCase()
  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()))

  const detected: DetectedSignal[] = []

  // Skip low-relevance articles
  if (relevanceScore < RELEVANCE_THRESHOLDS.LOW) return []

  // ── Check each signal type ────────────────────────────────────────────────
  for (const [signalType, patterns] of Object.entries(SIGNAL_KEYWORDS) as Array<[SignalType, string[]]>) {
    const matchingPatterns = patterns.filter(
      (p) => text.includes(p.toLowerCase()) || keywordSet.has(p.toLowerCase())
    )

    if (matchingPatterns.length === 0) continue

    // Category-specific boost
    const categoryMatch = isCategoryRelevant(signalType, category)
    if (!categoryMatch && matchingPatterns.length < 2) continue

    const severity = calculateSeverity(relevanceScore, matchingPatterns.length, signalType)

    detected.push({
      type:        signalType,
      severity,
      title:       buildSignalTitle(signalType, title),
      description: buildSignalDescription(signalType, matchingPatterns, title),
    })
  }

  // Deduplicate: keep highest severity per type
  const byType = new Map<SignalType, DetectedSignal>()
  for (const signal of detected) {
    const existing = byType.get(signal.type)
    if (!existing || severityRank(signal.severity) > severityRank(existing.severity)) {
      byType.set(signal.type, signal)
    }
  }

  return Array.from(byType.values())
}

function isCategoryRelevant(signalType: SignalType, category: OGCategory): boolean {
  const mapping: Partial<Record<SignalType, OGCategory[]>> = {
    price_change:        ['market', 'upstream', 'downstream'],
    supply_disruption:   ['supply_chain', 'midstream', 'upstream'],
    new_contract:        ['company', 'upstream', 'infrastructure'],
    regulatory_change:   ['regulation', 'politics'],
    infrastructure:      ['infrastructure', 'midstream', 'upstream'],
    logistics:           ['supply_chain', 'midstream'],
    market:              ['market', 'downstream'],
    company_news:        ['company'],
  }
  return (mapping[signalType] ?? []).includes(category)
}

function calculateSeverity(
  relevanceScore: number,
  matchCount: number,
  signalType: SignalType
): SignalSeverity {
  // Critical signal types get elevated severity
  const criticalTypes: SignalType[] = ['supply_disruption', 'regulatory_change']
  const highTypes: SignalType[] = ['price_change', 'new_contract', 'infrastructure']

  if (relevanceScore >= RELEVANCE_THRESHOLDS.CRITICAL && criticalTypes.includes(signalType)) {
    return 'critical'
  }
  if (relevanceScore >= RELEVANCE_THRESHOLDS.HIGH && (criticalTypes.includes(signalType) || matchCount >= 3)) {
    return 'high'
  }
  if (relevanceScore >= RELEVANCE_THRESHOLDS.MEDIUM && (highTypes.includes(signalType) || matchCount >= 2)) {
    return 'medium'
  }
  return 'low'
}

function buildSignalTitle(type: SignalType, articleTitle: string): string {
  const prefixes: Record<SignalType, string> = {
    price_change:      'Cambio de precios:',
    supply_disruption: 'Alerta de suministro:',
    new_contract:      'Nuevo contrato/licitación:',
    regulatory_change: 'Cambio regulatorio:',
    company_news:      'Novedad corporativa:',
    infrastructure:    'Infraestructura:',
    logistics:         'Logística:',
    market:            'Señal de mercado:',
  }
  const prefix = prefixes[type] ?? ''
  const shortened = articleTitle.length > 80 ? articleTitle.slice(0, 80) + '...' : articleTitle
  return `${prefix} ${shortened}`.trim()
}

function buildSignalDescription(type: SignalType, matchedPatterns: string[], title: string): string {
  return `Detectado en: "${title}". Términos clave identificados: ${matchedPatterns.slice(0, 5).join(', ')}.`
}

function severityRank(severity: SignalSeverity): number {
  const ranks: Record<SignalSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 }
  return ranks[severity]
}
