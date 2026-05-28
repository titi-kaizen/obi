import { createServerClient } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Zap, AlertTriangle, Info, TrendingDown } from 'lucide-react'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  medium:   'bg-amber-50 text-amber-700 border-amber-200',
  low:      'bg-blue-50 text-blue-700 border-blue-200',
}

const SEVERITY_ICON_BG: Record<string, string> = {
  critical: 'bg-red-50 text-red-600',
  high:     'bg-orange-50 text-orange-600',
  medium:   'bg-amber-50 text-amber-600',
  low:      'bg-blue-50 text-blue-600',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-red-200',
  high:     'border-orange-200',
  medium:   'border-amber-200',
  low:      'border-[#DDE3EC]',
}

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  critical: AlertTriangle,
  high:     TrendingDown,
  medium:   Zap,
  low:      Info,
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700',
  resolved:  'bg-gray-100 text-gray-600',
  dismissed: 'bg-red-50 text-red-700',
}

const TYPE_LABELS: Record<string, string> = {
  price_change:        'Variación precio',
  supply_disruption:   'Disrupción supply',
  new_contract:        'Nuevo contrato',
  regulatory_change:   'Cambio regulatorio',
  company_news:        'Noticias empresa',
  infrastructure:      'Infraestructura',
  logistics:           'Logística',
  market:              'Mercado',
}

function ago(d: string | null) {
  if (!d) return '—'
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: es })
}

async function getSignals(status?: string) {
  const db = createServerClient()
  let q = db
    .from('signals')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(50)
  if (status) q = q.eq('status', status)
  const { data } = await q
  return data ?? []
}

async function getSignalStats() {
  const db = createServerClient()
  const { data } = await db.from('signals').select('status, severity')
  if (!data) return { active: 0, critical: 0, high: 0, total: 0 }
  return {
    active:   data.filter(s => s.status === 'active').length,
    critical: data.filter(s => s.severity === 'critical' && s.status === 'active').length,
    high:     data.filter(s => s.severity === 'high' && s.status === 'active').length,
    total:    data.length,
  }
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const [signals, stats] = await Promise.all([
    getSignals(params.status),
    getSignalStats(),
  ])

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-white/60" /> Señales de mercado
        </h1>
        <p className="text-sm text-white/60">Eventos detectados con impacto en supply chain O&G</p>
      </div>
    <div className="p-6 space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#DDE3EC] px-4 py-4">
          <p className="text-2xl font-bold text-[#111827]">{stats.active}</p>
          <p className="text-xs text-[#546278]">Señales activas</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 px-4 py-4">
          <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
          <p className="text-xs text-[#546278]">Críticas</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 px-4 py-4">
          <p className="text-2xl font-bold text-orange-600">{stats.high}</p>
          <p className="text-xs text-[#546278]">Alta severidad</p>
        </div>
        <div className="bg-white rounded-xl border border-[#DDE3EC] px-4 py-4">
          <p className="text-2xl font-bold text-[#111827]">{stats.total}</p>
          <p className="text-xs text-[#546278]">Históricas</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          [undefined,    'Todas'],
          ['active',     'Activas'],
          ['resolved',   'Resueltas'],
          ['dismissed',  'Descartadas'],
        ] as [string | undefined, string][]).map(([s, label]) => (
          <a
            key={s ?? 'all'}
            href={s ? `/signals?status=${s}` : '/signals'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              params.status === s || (!params.status && !s)
                ? 'bg-[#E8F1FB] text-[#005BAC] border-[#BDD4F0] font-semibold'
                : 'bg-white text-[#546278] border-[#DDE3EC] hover:text-[#111827] hover:border-[#BCC9D9]'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Signals list */}
      <div className="space-y-3">
        {signals.length === 0 && (
          <div className="bg-white rounded-xl border border-[#DDE3EC] py-12 text-center px-6">
            <div className="w-12 h-12 rounded-xl bg-[#E8F1FB] flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-[#005BAC]" />
            </div>
            <p className="text-[#111827] font-semibold text-sm mb-1">Sin señales detectadas</p>
            <p className="text-[#546278] text-xs max-w-sm mx-auto">Las señales se generan automáticamente cuando se procesan artículos con relevancia alta. Procesá artículos desde el <a href="/" className="text-[#005BAC] hover:underline font-medium">Dashboard</a> para comenzar.</p>
          </div>
        )}
        {signals.length > 0 && signals.map((s: any) => {
          const Icon = SEVERITY_ICONS[s.severity] ?? Zap
          return (
            <div key={s.id} className={`bg-white rounded-xl border p-4 ${SEVERITY_BORDER[s.severity] ?? 'border-[#DDE3EC]'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${SEVERITY_ICON_BG[s.severity] ?? 'bg-[#E8F1FB] text-[#005BAC]'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-[#111827]">{s.title}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SEVERITY_COLORS[s.severity] ?? ''}`}>
                      {s.severity}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[s.status] ?? ''}`}>
                      {s.status}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-[#546278] mt-1 leading-relaxed">{s.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-[#8A9BB0]">
                    <span>{TYPE_LABELS[s.type] ?? s.type}</span>
                    <span>·</span>
                    <span>{ago(s.detected_at)}</span>
                    {s.article_ids?.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{s.article_ids.length} artículo{s.article_ids.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}
