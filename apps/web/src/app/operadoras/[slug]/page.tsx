import { createServerClient } from '@/lib/supabase'
import { OPERATOR_MAP, OPERATOR_KEYWORDS } from '@/lib/operators'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown, Minus, FileText, Newspaper } from 'lucide-react'

const CATEGORY_LABEL: Record<string, string> = {
  producer: 'Productora', integrated: 'Integrada', service_company: 'Servicios',
}
const CATEGORY_STYLE: Record<string, string> = {
  producer:        'bg-[#E8F1FB] text-[#005BAC]',
  integrated:      'bg-violet-50 text-violet-700',
  service_company: 'bg-emerald-50 text-emerald-700',
}
const COUNTRY_FLAG: Record<string, string> = {
  AR: '🇦🇷', US: '🇺🇸', FR: '🇫🇷', NL: '🇳🇱', CA: '🇨🇦',
}
const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-600', negative: 'text-red-600', neutral: 'text-[#546278]',
}
const CATEGORY_ARTICLE_COLORS: Record<string, string> = {
  upstream:     'bg-blue-50 text-blue-700',
  downstream:   'bg-violet-50 text-violet-700',
  midstream:    'bg-cyan-50 text-cyan-700',
  supply_chain: 'bg-emerald-50 text-emerald-700',
  regulation:   'bg-orange-50 text-orange-700',
  market:       'bg-amber-50 text-amber-700',
  company:      'bg-pink-50 text-pink-700',
  politics:     'bg-red-50 text-red-700',
  other:        'bg-gray-100 text-gray-600',
}

function ago(date: string | null) {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

async function getLatestBrief(slug: string) {
  const db = createServerClient()
  const { data } = await db
    .from('operator_briefs')
    .select('*')
    .eq('operator_slug', slug)
    .order('brief_date', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

async function getRecentArticles(slug: string) {
  const db = createServerClient()

  // Try articles_v2 first (Python pipeline, has operator_slugs)
  const { data: v2 } = await db
    .from('articles_v2')
    .select('id, title, url, published_at, scraped_at, category, sentiment, relevance_score, source_name, keywords')
    .eq('status', 'completed')
    .contains('operator_slugs', [slug])
    .order('scraped_at', { ascending: false })
    .limit(20)

  if (v2 && v2.length > 0) return v2

  // Fallback: keyword search on old articles table
  const keywords = OPERATOR_KEYWORDS[slug] ?? []
  if (!keywords.length) return []

  const orFilter = keywords.map(k => `title.ilike.%${k}%`).join(',')
  const { data: old } = await db
    .from('articles')
    .select('id, title, url, published_at, scraped_at, category, sentiment, relevance_score, sources(name)')
    .eq('status', 'done')
    .or(orFilter)
    .order('scraped_at', { ascending: false })
    .limit(20)

  return (old ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    url: a.url,
    published_at: a.published_at,
    scraped_at: a.scraped_at,
    category: a.category,
    sentiment: a.sentiment,
    relevance_score: a.relevance_score,
    source_name: a.sources?.name ?? '',
    keywords: [] as string[],
  }))
}

export default async function OperatorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const op = OPERATOR_MAP[slug]
  if (!op) notFound()

  const [brief, articles] = await Promise.all([
    getLatestBrief(slug),
    getRecentArticles(slug),
  ])

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-[#00205B] px-6 py-5">
        <Link href="/operadoras" className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs mb-3 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Operadoras
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xl">{COUNTRY_FLAG[op.country] ?? '🌐'}</span>
              <h1 className="text-xl font-bold text-white">{op.name}</h1>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_STYLE[op.category]}`}>
                {CATEGORY_LABEL[op.category]}
              </span>
            </div>
            <p className="text-sm text-white/60">{op.description}</p>
          </div>
          <a
            href={op.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Sitio web
          </a>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats row */}
        {brief && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Artículos" value={brief.article_count} />
            <StatCard
              label="Relevancia prom."
              value={brief.avg_relevance != null ? `${(brief.avg_relevance * 100).toFixed(0)}%` : '—'}
            />
            <StatCard
              label="Sentimiento"
              value={brief.dominant_sentiment ?? '—'}
              valueClass={SENTIMENT_COLORS[brief.dominant_sentiment ?? ''] ?? ''}
            />
            <StatCard
              label="Nivel de riesgo"
              value={brief.risk_level ?? '—'}
              valueClass={brief.risk_level === 'high' ? 'text-red-600' : brief.risk_level === 'medium' ? 'text-amber-600' : 'text-emerald-600'}
            />
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Articles */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#DDE3EC]">
            <div className="px-5 py-4 border-b border-[#DDE3EC] flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[#546278]" />
              <h2 className="text-sm font-semibold text-[#111827]">Artículos recientes</h2>
              {articles.length > 0 && (
                <span className="ml-auto text-xs text-[#8A9BB0]">{articles.length} artículos</span>
              )}
            </div>
            <div className="divide-y divide-[#DDE3EC]">
              {articles.length === 0 ? (
                <div className="px-5 py-10 text-center text-[#8A9BB0] text-sm">
                  Sin artículos clasificados aún para {op.name}.
                </div>
              ) : articles.map((a) => (
                <div key={a.id} className="px-5 py-3 hover:bg-[#F5F7FA] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#1A2B4A] hover:text-[#005BAC] line-clamp-2 font-medium transition-colors"
                      >
                        {a.title ?? 'Sin título'}
                      </a>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {a.category && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_ARTICLE_COLORS[a.category] ?? CATEGORY_ARTICLE_COLORS.other}`}>
                            {a.category}
                          </span>
                        )}
                        {a.sentiment && (
                          <span className={`text-[10px] font-medium ${SENTIMENT_COLORS[a.sentiment] ?? ''}`}>
                            {a.sentiment}
                          </span>
                        )}
                        {a.relevance_score != null && (
                          <span className="text-[10px] text-[#8A9BB0]">
                            rel: {(a.relevance_score * 100).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-[10px] text-[#8A9BB0]">{ago(a.scraped_at)}</span>
                        {a.source_name && (
                          <span className="text-[10px] text-[#8A9BB0]">{a.source_name}</span>
                        )}
                      </div>
                    </div>
                    {a.relevance_score != null && (
                      <div
                        className="shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                        style={{
                          borderColor: a.relevance_score > 0.7 ? '#059669' : a.relevance_score > 0.4 ? '#D97706' : '#BCC9D9',
                          color:       a.relevance_score > 0.7 ? '#059669' : a.relevance_score > 0.4 ? '#D97706' : '#8A9BB0',
                        }}
                      >
                        {(a.relevance_score * 10).toFixed(0)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brief panel */}
          <div className="bg-white rounded-xl border border-[#DDE3EC]">
            <div className="px-4 py-3 border-b border-[#DDE3EC] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#546278]" />
              <h2 className="text-sm font-semibold text-[#111827]">Último brief</h2>
              {brief && (
                <span className="ml-auto text-xs text-[#8A9BB0]">
                  {format(new Date(brief.brief_date), "d MMM yyyy", { locale: es })}
                </span>
              )}
            </div>
            {!brief ? (
              <div className="px-4 py-8 text-center text-[#8A9BB0] text-xs">
                Sin brief generado aún.<br />
                El pipeline genera briefs diariamente.
              </div>
            ) : (
              <div className="px-4 py-4">
                {brief.top_keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {brief.top_keywords.map((kw: string) => (
                      <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-[#F5F7FA] text-[#546278] rounded border border-[#DDE3EC]">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                {brief.content_md ? (
                  <div className="text-xs text-[#1A2B4A] leading-relaxed whitespace-pre-wrap font-sans">
                    {brief.content_md}
                  </div>
                ) : (
                  <p className="text-xs text-[#8A9BB0]">Sin contenido generado.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, valueClass = '' }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4">
      <p className={`text-xl font-bold text-[#111827] capitalize ${valueClass}`}>{value}</p>
      <p className="text-xs text-[#546278] mt-0.5">{label}</p>
    </div>
  )
}
