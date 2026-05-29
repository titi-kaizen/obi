import { createServerClient } from '@/lib/supabase'
import { OPERATORS, OPERATOR_KEYWORDS } from '@/lib/operators'
import Link from 'next/link'
import { Building2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Operator = typeof OPERATORS[number]

type BriefMap = Record<string, {
  operator_slug: string
  article_count: number
  avg_relevance: number | null
  dominant_sentiment: string | null
  risk_level: string | null
  brief_date: string
}>

type CountMap = Record<string, number>

const CATEGORY_LABEL: Record<string, string> = {
  producer:        'Productora',
  integrated:      'Integrada',
  service_company: 'Servicios',
}

const CATEGORY_STYLE: Record<string, string> = {
  producer:        'bg-[#E8F1FB] text-[#005BAC]',
  integrated:      'bg-violet-50 text-violet-700',
  service_company: 'bg-emerald-50 text-emerald-700',
}

const COUNTRY_FLAG: Record<string, string> = {
  AR: '🇦🇷', US: '🇺🇸', FR: '🇫🇷', NL: '🇳🇱', CA: '🇨🇦',
}

const RISK_STYLE: Record<string, string> = {
  low:    'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
}

async function getLatestBriefs(): Promise<BriefMap> {
  const db = createServerClient()
  const { data } = await db
    .from('operator_briefs')
    .select('operator_slug, article_count, avg_relevance, dominant_sentiment, risk_level, brief_date')
    .order('brief_date', { ascending: false })
  if (!data) return {}
  const map: BriefMap = {}
  for (const row of data) {
    if (!map[row.operator_slug]) map[row.operator_slug] = row
  }
  return map
}

async function getArticleCounts(): Promise<CountMap> {
  const db = createServerClient()

  // Try articles_v2 first (Python pipeline)
  const { data: v2 } = await db
    .from('articles_v2')
    .select('operator_slugs')
    .eq('status', 'completed')

  const counts: CountMap = {}

  if (v2 && v2.length > 0) {
    for (const row of v2) {
      for (const slug of (row.operator_slugs ?? [])) {
        counts[slug] = (counts[slug] ?? 0) + 1
      }
    }
    return counts
  }

  // Fallback: keyword match on old articles table
  const { data: old } = await db
    .from('articles')
    .select('title')
    .eq('status', 'done')
    .not('title', 'is', null)

  if (!old) return counts
  for (const [slug, keywords] of Object.entries(OPERATOR_KEYWORDS)) {
    counts[slug] = old.filter(a =>
      keywords.some(kw => a.title?.toLowerCase().includes(kw.toLowerCase()))
    ).length
  }
  return counts
}

function SentimentIcon({ s }: { s: string | null }) {
  if (s === 'positive') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
  if (s === 'negative') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
  return <Minus className="w-3.5 h-3.5 text-[#8A9BB0]" />
}

function OperatorCard({ op, brief, count }: { op: Operator; brief?: BriefMap[string]; count: number }) {
  return (
    <Link
      href={`/operadoras/${op.slug}`}
      className="bg-white rounded-xl border border-[#DDE3EC] p-4 hover:border-[#005BAC] hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{COUNTRY_FLAG[op.country] ?? '🌐'}</span>
          <p className="text-sm font-semibold text-[#111827] truncate group-hover:text-[#005BAC] transition-colors">
            {op.name}
          </p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${CATEGORY_STYLE[op.category]}`}>
          {CATEGORY_LABEL[op.category]}
        </span>
      </div>

      <p className="text-xs text-[#546278] line-clamp-2 mb-3 leading-relaxed">{op.description}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3 text-[#8A9BB0]" />
            <span className="text-xs text-[#546278]">{count} artículos</span>
          </div>
          {brief?.dominant_sentiment && (
            <SentimentIcon s={brief.dominant_sentiment} />
          )}
        </div>
        {brief?.risk_level && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${RISK_STYLE[brief.risk_level]}`}>
            riesgo {brief.risk_level}
          </span>
        )}
      </div>
    </Link>
  )
}

function Section({ title, operators, briefs, counts }: {
  title: string
  operators: readonly Operator[]
  briefs: BriefMap
  counts: CountMap
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-3">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {operators.map(op => (
          <OperatorCard
            key={op.slug}
            op={op}
            brief={briefs[op.slug]}
            count={counts[op.slug] ?? briefs[op.slug]?.article_count ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

export default async function OperadorasPage() {
  const [latestBriefs, articleCounts] = await Promise.all([
    getLatestBriefs(),
    getArticleCounts(),
  ])

  const producers = OPERATORS.filter(o => o.category !== 'service_company')
  const services  = OPERATORS.filter(o => o.category === 'service_company')

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5">
        <h1 className="text-xl font-bold text-white">Operadoras</h1>
        <p className="text-sm text-white/60">20 compañías monitoreadas — O&G Argentina</p>
      </div>

      <div className="p-6 space-y-8">
        <Section title="Productoras e Integradas" operators={producers} briefs={latestBriefs} counts={articleCounts} />
        <Section title="Empresas de Servicios"    operators={services}  briefs={latestBriefs} counts={articleCounts} />
      </div>
    </div>
  )
}
