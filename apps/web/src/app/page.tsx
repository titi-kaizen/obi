import { createServerClient } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Newspaper, Zap, Database, AlertTriangle, Clock, TrendingUp, Activity } from 'lucide-react'
import RefreshButton from '@/components/refresh-button'
import ProcessButton from '@/components/process-button'

export const dynamic = 'force-dynamic'

async function getStats() {
  const db = createServerClient()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

  const [total, completed, processing, failed, today_count, week_count, signals, sources] = await Promise.all([
    db.from('articles_v2').select('id', { count: 'exact', head: true }),
    db.from('articles_v2').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    db.from('articles_v2').select('id', { count: 'exact', head: true }).in('status', ['scraped', 'parsing']),
    db.from('articles_v2').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    db.from('articles_v2').select('id', { count: 'exact', head: true }).gte('scraped_at', today),
    db.from('articles_v2').select('id', { count: 'exact', head: true }).gte('scraped_at', weekAgo),
    db.from('signals').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('sources_v2').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])
  return {
    total: total.count ?? 0,
    completed: completed.count ?? 0,
    processing: processing.count ?? 0,
    failed: failed.count ?? 0,
    today: today_count.count ?? 0,
    week: week_count.count ?? 0,
    signals: signals.count ?? 0,
    sources: sources.count ?? 0,
  }
}

async function getRecentArticles() {
  const db = createServerClient()
  const { data } = await db
    .from('articles_v2')
    .select('id, title, url, published_at, scraped_at, category, sentiment, relevance_score, source_name, operator_slugs')
    .eq('status', 'completed')
    .not('relevance_score', 'is', null)
    .gte('relevance_score', 0.3)
    .order('scraped_at', { ascending: false })
    .limit(12)
  return data ?? []
}

async function getActiveSignals() {
  const db = createServerClient()
  const { data } = await db
    .from('signals')
    .select('id, type, title, description, severity, detected_at')
    .eq('status', 'active')
    .order('detected_at', { ascending: false })
    .limit(5)
  return data ?? []
}

async function getSourcesHealth() {
  const db = createServerClient()
  const { data } = await db
    .from('sources_v2')
    .select('id, name, source_type, source_category, last_scraped_at, error_count, is_active')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(8)
  return data ?? []
}

async function getCategoryBreakdown() {
  const db = createServerClient()
  const { data } = await db
    .from('articles_v2')
    .select('category')
    .eq('status', 'completed')
    .not('category', 'is', null)
  if (!data) return []
  const counts: Record<string, number> = {}
  for (const row of data) {
    if (row.category) counts[row.category] = (counts[row.category] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }))
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  medium:   'bg-amber-50 text-amber-700 border-amber-200',
  low:      'bg-blue-50 text-blue-700 border-blue-200',
}

const CATEGORY_COLORS: Record<string, string> = {
  upstream:     'bg-blue-50 text-blue-700',
  downstream:   'bg-violet-50 text-violet-700',
  midstream:    'bg-cyan-50 text-cyan-700',
  supply_chain: 'bg-emerald-50 text-emerald-700',
  regulation:   'bg-orange-50 text-orange-700',
  market:       'bg-amber-50 text-amber-700',
  company:      'bg-pink-50 text-pink-700',
  politics:     'bg-red-50 text-red-700',
  infrastructure: 'bg-teal-50 text-teal-700',
  other:        'bg-gray-100 text-gray-600',
}

const CATEGORY_LABELS: Record<string, string> = {
  upstream:      'Upstream',
  downstream:    'Downstream',
  midstream:     'Midstream',
  supply_chain:  'Supply Chain',
  regulation:    'Regulación',
  market:        'Mercado',
  company:       'Empresa',
  politics:      'Política',
  infrastructure:'Infraestructura',
  environment:   'Ambiente',
  other:         'Otro',
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-emerald-600',
  negative: 'text-red-600',
  neutral:  'text-[#546278]',
}

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, highlight }: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
  iconBg: string
  iconColor: string
  highlight?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 flex items-start gap-4 ${highlight ? 'border-[#005BAC]/30' : 'border-[#DDE3EC]'}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[#111827]">{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</p>
        <p className="text-sm text-[#546278]">{label}</p>
        {sub && <p className="text-xs text-[#8A9BB0] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function ago(date: string | null) {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

export default async function DashboardPage() {
  const [stats, articles, signals, sources, categories] = await Promise.all([
    getStats(),
    getRecentArticles(),
    getActiveSignals(),
    getSourcesHealth(),
    getCategoryBreakdown(),
  ])

  const pendingCount = stats.processing + stats.failed

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-white/60">Inteligencia de cadena de suministro — O&G Argentina</p>
        </div>
        <div className="flex items-center gap-2">
          <ProcessButton pendingCount={pendingCount} />
          <RefreshButton />
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={Newspaper}
            label="Artículos procesados"
            value={stats.completed}
            sub={`${stats.today} hoy · ${stats.week} esta semana`}
            iconBg="bg-[#E8F1FB]" iconColor="text-[#005BAC]"
            highlight
          />
          <StatCard
            icon={Activity}
            label="En pipeline"
            value={stats.processing}
            sub={stats.failed > 0 ? `${stats.failed} fallidos` : undefined}
            iconBg={stats.processing > 0 ? 'bg-amber-50' : 'bg-gray-50'}
            iconColor={stats.processing > 0 ? 'text-amber-600' : 'text-gray-400'}
          />
          <StatCard
            icon={Zap}
            label="Señales activas"
            value={stats.signals}
            iconBg="bg-[#FFF8CC]" iconColor="text-[#B8860B]"
          />
          <StatCard
            icon={Database}
            label="Fuentes activas"
            value={stats.sources}
            sub={`${stats.total.toLocaleString('es-AR')} artículos totales`}
            iconBg="bg-emerald-50" iconColor="text-emerald-600"
          />
        </div>

        {/* Category breakdown */}
        {categories.length > 0 && (
          <div className="bg-white rounded-xl border border-[#DDE3EC] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#111827] mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#546278]" /> Distribución por categoría
            </h2>
            <div className="flex flex-wrap gap-2">
              {categories.map(({ category, count }) => (
                <div key={category} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other}`}>
                  <span>{CATEGORY_LABELS[category] ?? category}</span>
                  <span className="opacity-60">·</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent Articles */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#DDE3EC]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DDE3EC]">
              <h2 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#546278]" /> Artículos recientes
              </h2>
              <a href="/articles" className="text-xs text-[#005BAC] hover:text-[#004A96] font-medium">Ver todos →</a>
            </div>
            <div className="divide-y divide-[#DDE3EC]">
              {articles.length === 0 ? (
                <div className="px-5 py-8 text-center text-[#8A9BB0] text-sm">
                  Sin artículos procesados aún. El scraper está iniciando...
                </div>
              ) : articles.map((a: any) => (
                <div key={a.id} className="px-5 py-3 hover:bg-[#F5F7FA] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#1A2B4A] hover:text-[#005BAC] line-clamp-2 leading-snug font-medium transition-colors"
                      >
                        {a.title ?? 'Sin título'}
                      </a>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {a.category && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[a.category] ?? CATEGORY_COLORS.other}`}>
                            {CATEGORY_LABELS[a.category] ?? a.category}
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
                          <span className="text-[10px] text-[#8A9BB0] truncate">{a.source_name}</span>
                        )}
                      </div>
                    </div>
                    {a.relevance_score != null && (
                      <div className="shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                        style={{
                          borderColor: a.relevance_score > 0.7 ? '#059669' : a.relevance_score > 0.4 ? '#D97706' : '#BCC9D9',
                          color:       a.relevance_score > 0.7 ? '#059669' : a.relevance_score > 0.4 ? '#D97706' : '#8A9BB0',
                        }}
                      >
                        {(a.relevance_score * 100).toFixed(0)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Active Signals */}
            <div className="bg-white rounded-xl border border-[#DDE3EC]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDE3EC]">
                <h2 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#B8860B]" /> Señales activas
                </h2>
                <a href="/signals" className="text-xs text-[#005BAC] hover:text-[#004A96] font-medium">Ver todas →</a>
              </div>
              <div className="divide-y divide-[#DDE3EC]">
                {signals.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[#8A9BB0] text-xs">Sin señales activas</div>
                ) : signals.map((s: any) => (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${SEVERITY_COLORS[s.severity] ?? ''}`}>
                        {s.severity}
                      </span>
                      <div>
                        <p className="text-xs text-[#1A2B4A] font-medium leading-snug">{s.title}</p>
                        <p className="text-[10px] text-[#8A9BB0] mt-0.5">{ago(s.detected_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sources Health */}
            <div className="bg-white rounded-xl border border-[#DDE3EC]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#DDE3EC]">
                <h2 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" /> Estado de fuentes
                </h2>
                <a href="/sources" className="text-xs text-[#005BAC] hover:text-[#004A96] font-medium">Ver todas →</a>
              </div>
              <div className="divide-y divide-[#DDE3EC]">
                {sources.map((s: any) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-[#1A2B4A] truncate font-medium">{s.name}</p>
                      <p className="text-[10px] text-[#8A9BB0]">{s.last_scraped_at ? ago(s.last_scraped_at) : 'nunca'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.error_count > 0 && (
                        <AlertTriangle className="w-3 h-3 text-orange-500" />
                      )}
                      <div className={`w-2 h-2 rounded-full ${s.error_count > 3 ? 'bg-red-500' : s.last_scraped_at ? 'bg-emerald-500' : 'bg-[#BCC9D9]'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
