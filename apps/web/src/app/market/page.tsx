'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, Minus, Cpu, Zap, BarChart3,
  Building2, Users, Package, RefreshCw, Lightbulb, AlertTriangle,
  DollarSign, FileText, Activity,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PressureIndex { score: number; label: string; color: string; breakdown: Record<string, number> }
interface Stats {
  contracts30d: number; contracts90d: number; investments30d: number
  totalInvestmentUSD: number; operatorsActive: number; upstream30d: number
  highRelevance30d: number; articles30d: number
}
interface TopItem  { name: string; count: number }
interface CatItem  { cat: string; count: number }
interface Signal   { category: string; signal: string; severity: 'high' | 'medium' | 'low' }
interface Event    { id: string; fecha: string; operadora?: string; proveedor?: string; categoria: string; tipo_evento: string; monto?: number; moneda?: string; titulo_noticia: string; resumen?: string }
interface Insight  { titulo: string; descripcion: string; tipo: string; impacto: 'alto' | 'medio' | 'bajo'; categoria_afectada?: string | null }
interface MarketData {
  pressureIndex: PressureIndex; stats: Stats
  topOperators: TopItem[]; topSuppliers: TopItem[]
  categoryDistribution: CatItem[]; pressureSignals: Signal[]
  recentEvents: Event[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CAT_LABELS: Record<string, string> = {
  gasoductos: 'Gasoductos', oleoductos: 'Oleoductos', ductos: 'Ductos',
  obras_civiles: 'Obras Civiles', epc: 'EPC', electricidad: 'Electricidad',
  campamentos: 'Campamentos', perforacion: 'Perforación', fractura: 'Fractura',
  logistica: 'Logística', transporte: 'Transporte', arena: 'Arena',
  agua: 'Agua', mantenimiento: 'Mantenimiento', facilities: 'Facilities',
  ingenieria: 'Ingeniería', otro: 'Otro',
}

const TIPO_LABELS: Record<string, string> = {
  contrato: 'Contrato', licitacion: 'Licitación', adjudicacion: 'Adjudicación',
  inversion: 'Inversión', ampliacion: 'Ampliación', expansion: 'Expansión', otro: 'Evento',
}

const IMPACTO_COLORS: Record<string, string> = {
  alto:  'bg-red-50 text-red-700 border-red-200',
  medio: 'bg-amber-50 text-amber-700 border-amber-200',
  bajo:  'bg-blue-50 text-blue-700 border-blue-200',
}

const TIPO_INSIGHT_ICONS: Record<string, React.ReactNode> = {
  presion_costos:      <TrendingUp  className="w-4 h-4 text-red-500"     />,
  tendencia:           <BarChart3   className="w-4 h-4 text-blue-500"    />,
  oportunidad:         <Zap         className="w-4 h-4 text-emerald-500" />,
  riesgo:              <AlertTriangle className="w-4 h-4 text-amber-500" />,
  actividad_operadora: <Building2   className="w-4 h-4 text-violet-500"  />,
}

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PressureGauge({ index }: { index: PressureIndex }) {
  const { score, label, color, breakdown } = index
  const pct = score / 100

  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-5">
      <p className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-4">Supply Chain Pressure Index</p>

      <div className="flex items-end gap-4 mb-4">
        <p className="text-6xl font-black" style={{ color }}>{score}</p>
        <div className="pb-2">
          <p className="text-sm font-bold" style={{ color }}>{label}</p>
          <p className="text-xs text-[#8A9BB0]">de 100 puntos</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 bg-[#F5F7FA] rounded-full mb-1 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[#8A9BB0] mb-4">
        <span>Frío</span><span>Normal</span><span>Presión</span><span>Hot</span>
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5">
        {Object.entries(breakdown).map(([key, pts]) => (
          <div key={key} className="flex items-center gap-2">
            <p className="text-[10px] text-[#8A9BB0] w-20 capitalize">{key}</p>
            <div className="flex-1 h-1.5 bg-[#F5F7FA] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${(pts / 25) * 100}%`, backgroundColor: color, opacity: 0.7 }}
              />
            </div>
            <p className="text-[10px] text-[#546278] w-6 text-right font-medium">{pts}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color = '#005BAC', bg = '#E8F1FB' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string; bg?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold text-[#111827]">{value}</p>
        <p className="text-xs text-[#546278]">{label}</p>
        {sub && <p className="text-[10px] text-[#8A9BB0] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function BarList({ items, label }: { items: TopItem[]; label: string }) {
  const max = items[0]?.count ?? 1
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4">
      <p className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-3">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#8A9BB0] py-4 text-center">Sin datos aún</p>
      ) : (
        <div className="space-y-2">
          {items.map(({ name, count }) => (
            <div key={name} className="flex items-center gap-2">
              <p className="text-xs text-[#1A2B4A] w-36 truncate font-medium">{name}</p>
              <div className="flex-1 h-2 bg-[#F5F7FA] rounded-full overflow-hidden">
                <div className="h-full bg-[#005BAC] rounded-full" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <p className="text-xs text-[#8A9BB0] w-5 text-right">{count}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryGrid({ items }: { items: CatItem[] }) {
  const max = items[0]?.count ?? 1
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4">
      <p className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-3">Categorías más demandadas</p>
      {items.length === 0 ? (
        <p className="text-xs text-[#8A9BB0] py-4 text-center">Sin contratos detectados aún</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(({ cat, count }) => (
            <div key={cat} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E8F1FB] border border-[#BDD4F0]">
              <span className="text-xs font-medium text-[#005BAC]">{CAT_LABELS[cat] ?? cat}</span>
              <span className="text-[10px] text-[#546278] font-bold">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SignalsList({ signals }: { signals: Signal[] }) {
  const colors: Record<string, string> = {
    high:   'bg-red-50 border-red-200 text-red-700',
    medium: 'bg-amber-50 border-amber-200 text-amber-700',
    low:    'bg-blue-50 border-blue-200 text-blue-700',
  }
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4">
      <p className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-3">Señales de presión de costos</p>
      {signals.length === 0 ? (
        <p className="text-xs text-[#8A9BB0] py-4 text-center">Sin señales detectadas — mercado en calma o datos insuficientes</p>
      ) : (
        <div className="space-y-2">
          {signals.map((s, i) => (
            <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${colors[s.severity]}`}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{s.signal}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EventsList({ events }: { events: Event[] }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC]">
      <div className="px-4 py-3 border-b border-[#DDE3EC]">
        <p className="text-xs font-semibold text-[#546278] uppercase tracking-wider">Contratos e inversiones recientes</p>
      </div>
      {events.length === 0 ? (
        <div className="px-4 py-8 text-center text-[#8A9BB0] text-xs">
          Sin eventos detectados.<br />Presioná "Extraer Contratos" para analizar los artículos.
        </div>
      ) : (
        <div className="divide-y divide-[#DDE3EC]">
          {events.map(ev => (
            <div key={ev.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-xs text-[#1A2B4A] font-medium line-clamp-2 flex-1">{ev.titulo_noticia}</p>
                <span className="text-[10px] bg-[#E8F1FB] text-[#005BAC] px-1.5 py-0.5 rounded font-medium shrink-0">
                  {TIPO_LABELS[ev.tipo_evento] ?? ev.tipo_evento}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-[#8A9BB0]">{ev.fecha}</span>
                {ev.operadora && <span className="text-[10px] text-[#546278] font-medium">{ev.operadora}</span>}
                {ev.proveedor && <><span className="text-[10px] text-[#8A9BB0]">→</span><span className="text-[10px] text-[#546278]">{ev.proveedor}</span></>}
                <span className="text-[10px] text-[#8A9BB0]">{CAT_LABELS[ev.categoria] ?? ev.categoria}</span>
                {ev.monto && <span className="text-[10px] font-semibold text-emerald-600">{fmt(ev.monto)} {ev.moneda}</span>}
              </div>
              {ev.resumen && <p className="text-[10px] text-[#8A9BB0] mt-1 line-clamp-2">{ev.resumen}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="bg-white rounded-xl border border-[#DDE3EC] p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {TIPO_INSIGHT_ICONS[insight.tipo] ?? <Lightbulb className="w-4 h-4 text-[#8A9BB0]" />}
          <p className="text-sm font-semibold text-[#111827]">{insight.titulo}</p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${IMPACTO_COLORS[insight.impacto]}`}>
          {insight.impacto}
        </span>
      </div>
      <p className="text-xs text-[#546278] leading-relaxed">{insight.descripcion}</p>
      {insight.categoria_afectada && (
        <p className="text-[10px] text-[#8A9BB0] mt-2">
          Categoría: {CAT_LABELS[insight.categoria_afectada] ?? insight.categoria_afectada}
        </p>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [data,          setData]          = useState<MarketData | null>(null)
  const [loadingData,   setLoadingData]   = useState(true)
  const [extracting,    setExtracting]    = useState(false)
  const [extractResult, setExtractResult] = useState<string>('')
  const [insights,      setInsights]      = useState<{ insights: Insight[]; outlook: string; generatedAt: string } | null>(null)
  const [genInsights,   setGenInsights]   = useState(false)

  const loadData = useCallback(async () => {
    setLoadingData(true)
    try {
      const res = await fetch('/api/market-intelligence')
      if (res.ok) setData(await res.json())
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleExtract() {
    setExtracting(true)
    setExtractResult('')
    let total = 0
    try {
      while (true) {
        const res = await fetch('/api/extract-contracts', { method: 'POST' })
        const d   = await res.json()
        total += d.extracted ?? 0
        if (!d.extracted || d.extracted === 0) break
      }
      setExtractResult(total > 0 ? `${total} contratos extraídos` : 'Sin nuevos contratos detectados')
      await loadData()
    } catch {
      setExtractResult('Error en la extracción')
    } finally {
      setExtracting(false)
    }
  }

  async function handleGenerateInsights() {
    setGenInsights(true)
    try {
      const res = await fetch('/api/generate-market-insights', { method: 'POST' })
      const d   = await res.json()
      if (res.ok) setInsights(d)
      else setExtractResult(d.error ?? 'Error generando insights')
    } catch {
      setExtractResult('Error generando insights')
    } finally {
      setGenInsights(false)
    }
  }

  const { pressureIndex, stats, topOperators, topSuppliers, categoryDistribution, pressureSignals, recentEvents } = data ?? {
    pressureIndex: { score: 0, label: 'Cargando...', color: '#6B7280', breakdown: {} },
    stats: { contracts30d: 0, contracts90d: 0, investments30d: 0, totalInvestmentUSD: 0, operatorsActive: 0, upstream30d: 0, highRelevance30d: 0, articles30d: 0 },
    topOperators: [], topSuppliers: [], categoryDistribution: [], pressureSignals: [], recentEvents: [],
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-[#00205B] px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-white/60" /> Market Intelligence
          </h1>
          <p className="text-sm text-white/60">Cost Intelligence & Supply Chain Pressure Engine — O&G Argentina</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {extractResult && (
            <span className="text-xs text-white/70 bg-white/10 px-2 py-1 rounded">{extractResult}</span>
          )}
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#E8F1FB] border border-[#BDD4F0] text-[#005BAC] hover:bg-[#D4E7F8] disabled:opacity-50 transition-colors"
          >
            <Cpu className={`w-3.5 h-3.5 ${extracting ? 'animate-pulse' : ''}`} />
            {extracting ? 'Extrayendo...' : 'Extraer Contratos'}
          </button>
          <button
            onClick={handleGenerateInsights}
            disabled={genInsights}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/20 text-white hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            <Lightbulb className={`w-3.5 h-3.5 ${genInsights ? 'animate-pulse' : ''}`} />
            {genInsights ? 'Generando...' : 'Generar Insights'}
          </button>
          <button
            onClick={loadData}
            disabled={loadingData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/20 text-white hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Row 1: Pressure index + stats */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-1">
            <PressureGauge index={pressureIndex} />
          </div>
          <div className="xl:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4 content-start">
            <StatCard
              icon={FileText}
              label="Contratos detectados (30d)"
              value={stats.contracts30d}
              sub={`${stats.contracts90d} en 90 días`}
              color="#005BAC" bg="#E8F1FB"
            />
            <StatCard
              icon={DollarSign}
              label="Inversiones anunciadas"
              value={stats.totalInvestmentUSD > 0 ? fmt(stats.totalInvestmentUSD) : '—'}
              sub="últimos 90 días, solo USD"
              color="#059669" bg="#ECFDF5"
            />
            <StatCard
              icon={Building2}
              label="Operadoras activas"
              value={stats.operatorsActive}
              sub="con noticias en 30 días"
              color="#7C3AED" bg="#F5F3FF"
            />
            <StatCard
              icon={Activity}
              label="Artículos upstream (30d)"
              value={stats.upstream30d}
              sub={`${stats.highRelevance30d} alta relevancia`}
              color="#D97706" bg="#FFFBEB"
            />
            <StatCard
              icon={TrendingUp}
              label="Inversiones / ampliaciones"
              value={stats.investments30d}
              sub="eventos tipo inversión (30d)"
              color="#DC2626" bg="#FEF2F2"
            />
            <StatCard
              icon={Package}
              label="Total artículos (30d)"
              value={stats.articles30d}
              sub={`${stats.contracts90d} contratos en base`}
              color="#0891B2" bg="#ECFEFF"
            />
          </div>
        </div>

        {/* Row 2: Signals + Category distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SignalsList signals={pressureSignals} />
          <CategoryGrid items={categoryDistribution} />
        </div>

        {/* Row 3: Top operators + Top suppliers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BarList items={topOperators} label="Top Operadoras — actividad 30d" />
          <BarList items={topSuppliers} label="Top Proveedores — contratos 90d" />
        </div>

        {/* Row 4: Recent events */}
        <EventsList events={recentEvents} />

        {/* Row 5: AI Insights */}
        {insights && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-[#B8860B]" /> Insights Automáticos
              </h2>
              <p className="text-xs text-[#8A9BB0]">
                Generado {new Date(insights.generatedAt).toLocaleString('es-AR')}
              </p>
            </div>

            {insights.outlook && (
              <div className="bg-[#00205B] rounded-xl p-4">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Outlook de mercado — próximas 4-8 semanas</p>
                <p className="text-sm text-white leading-relaxed">{insights.outlook}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          </div>
        )}

        {!insights && (
          <div className="bg-white rounded-xl border border-dashed border-[#DDE3EC] py-10 text-center">
            <Lightbulb className="w-8 h-8 text-[#BCC9D9] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#546278]">Insights automáticos</p>
            <p className="text-xs text-[#8A9BB0] mt-1 mb-4 max-w-sm mx-auto">
              Presioná "Generar Insights" para que la IA analice los contratos y noticias y genere conclusiones estratégicas.
            </p>
            <button
              onClick={handleGenerateInsights}
              disabled={genInsights}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#005BAC] text-white rounded-lg text-sm font-semibold hover:bg-[#004A96] disabled:opacity-50 transition-colors"
            >
              <Lightbulb className="w-4 h-4" />
              {genInsights ? 'Generando...' : 'Generar Insights'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
