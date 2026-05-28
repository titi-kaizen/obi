'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Database, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw, ExternalLink } from 'lucide-react'

export const SOURCES_STORAGE_KEY = 'obi_selected_sources'

const TYPE_COLORS: Record<string, string> = {
  rss:        'bg-blue-50 text-blue-700',
  html:       'bg-violet-50 text-violet-700',
  playwright: 'bg-amber-50 text-amber-700',
}

const CAT_COLORS: Record<string, string> = {
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

function ago(d: string | null) {
  if (!d) return 'nunca'
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: es })
}

export interface Source {
  id: string
  name: string
  url: string
  type: string
  category: string
  scrape_interval_minutes: number
  is_active: boolean
  last_scraped_at: string | null
  last_error: string | null
  error_count: number
}

interface Props {
  sources: Source[]
  counts: Record<string, number>
}

export default function SourcesClient({ sources, counts }: Props) {
  const allIds = sources.map(s => s.id)
  const [selected, setSelected] = useState<Set<string>>(new Set(allIds))
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SOURCES_STORAGE_KEY)
    if (stored) {
      try {
        setSelected(new Set(JSON.parse(stored) as string[]))
      } catch {
        setSelected(new Set(allIds))
      }
    }
    setHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function selectAll() {
    const next = new Set(allIds)
    setSelected(next)
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify([...next]))
  }

  function clearAll() {
    setSelected(new Set())
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify([]))
  }

  const [scraping, setScraping] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [bulkScrape, setBulkScrape] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function triggerScrape(e: React.MouseEvent, sourceId: string) {
    e.stopPropagation()
    setScraping(prev => ({ ...prev, [sourceId]: 'loading' }))
    try {
      const res = await fetch('/api/scrape-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setScraping(prev => ({ ...prev, [sourceId]: 'done' }))
      setTimeout(() => setScraping(prev => ({ ...prev, [sourceId]: 'idle' })), 4000)
    } catch {
      setScraping(prev => ({ ...prev, [sourceId]: 'error' }))
      setTimeout(() => setScraping(prev => ({ ...prev, [sourceId]: 'idle' })), 4000)
    }
  }

  async function triggerScrapeAll() {
    if (selected.size === 0) return
    setBulkScrape('loading')
    try {
      const res = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setBulkScrape('done')
      setTimeout(() => setBulkScrape('idle'), 5000)
    } catch {
      setBulkScrape('error')
      setTimeout(() => setBulkScrape('idle'), 5000)
    }
  }

  const active        = sources.filter(s => s.is_active).length
  const healthy       = sources.filter(s => s.is_active && s.error_count === 0).length
  const errors        = sources.filter(s => s.error_count > 0).length
  const selectedCount = selected.size

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-white/60" /> Fuentes
          </h1>
          <p className="text-sm text-white/60">{sources.length} fuentes configuradas para O&G Argentina</p>
        </div>
        {hydrated && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/70">
              <span className="text-white font-bold">{selectedCount}</span>
              {' '}/ {sources.length} para brief
            </span>
            <button
              onClick={selectAll}
              className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              Todas
            </button>
            <button
              onClick={clearAll}
              className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              Ninguna
            </button>
            <button
              onClick={triggerScrapeAll}
              disabled={bulkScrape === 'loading' || selected.size === 0}
              className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded font-semibold transition-colors border ${
                bulkScrape === 'done'    ? 'bg-emerald-500 border-emerald-400 text-white' :
                bulkScrape === 'error'  ? 'bg-red-500 border-red-400 text-white' :
                bulkScrape === 'loading'? 'bg-white/10 border-white/20 text-white/50 cursor-not-allowed' :
                selected.size === 0     ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed' :
                'bg-[#FFD100] border-[#FFD100] text-[#00205B] hover:bg-yellow-300'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${bulkScrape === 'loading' ? 'animate-spin' : ''}`} />
              {bulkScrape === 'done'    ? `${selectedCount} en cola` :
               bulkScrape === 'error'  ? 'Error' :
               bulkScrape === 'loading'? 'Enviando...' :
               `Scrapear ${selectedCount}`}
            </button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#DDE3EC] px-4 py-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xl font-bold text-[#111827]">{active}</p>
            <p className="text-xs text-[#546278]">Activas</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#DDE3EC] px-4 py-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-[#005BAC] shrink-0" />
          <div>
            <p className="text-xl font-bold text-[#111827]">{healthy}</p>
            <p className="text-xs text-[#546278]">Sin errores</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#DDE3EC] px-4 py-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
          <div>
            <p className="text-xl font-bold text-[#111827]">{errors}</p>
            <p className="text-xs text-[#546278]">Con errores</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sources.map(s => {
          const articleCount = counts[s.id] ?? 0
          const hasScraped   = !!s.last_scraped_at
          const isSelected   = !hydrated || selected.has(s.id)

          return (
            <div
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`bg-white rounded-xl border p-4 space-y-3 cursor-pointer transition-all select-none ${
                isSelected
                  ? 'border-[#005BAC] ring-1 ring-[#005BAC]/10'
                  : 'border-[#DDE3EC] opacity-50 hover:opacity-75'
              } ${s.error_count > 3 ? '!border-red-300' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#111827] leading-snug truncate">{s.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <p className="text-xs text-[#8A9BB0] truncate">{s.url}</p>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="shrink-0 text-[#BCC9D9] hover:text-[#005BAC] transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hydrated && (
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-[#005BAC] border-[#005BAC]' : 'border-[#BCC9D9]'
                    }`}>
                      {isSelected && <span className="text-white text-[9px] font-black leading-none">✓</span>}
                    </div>
                  )}
                  {!s.is_active ? (
                    <XCircle className="w-4 h-4 text-[#BCC9D9]" />
                  ) : s.error_count > 3 ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : s.error_count > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                  ) : hasScraped ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-[#BCC9D9]" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[s.type] ?? ''}`}>
                  {s.type}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CAT_COLORS[s.category] ?? CAT_COLORS.other}`}>
                  {s.category}
                </span>
                {isSelected && hydrated && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#E8F1FB] text-[#005BAC]">
                    en brief
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#F5F7FA] rounded-lg py-2">
                  <p className="text-sm font-bold text-[#111827]">{articleCount}</p>
                  <p className="text-[10px] text-[#8A9BB0]">artículos</p>
                </div>
                <div className="bg-[#F5F7FA] rounded-lg py-2">
                  <p className="text-sm font-bold text-[#111827]">{s.scrape_interval_minutes}m</p>
                  <p className="text-[10px] text-[#8A9BB0]">intervalo</p>
                </div>
                <div className="bg-[#F5F7FA] rounded-lg py-2">
                  <p className={`text-sm font-bold ${s.error_count > 0 ? 'text-orange-600' : 'text-[#111827]'}`}>
                    {s.error_count}
                  </p>
                  <p className="text-[10px] text-[#8A9BB0]">errores</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-[#8A9BB0]">
                  Último: {ago(s.last_scraped_at)}
                </p>
                <button
                  onClick={(e) => triggerScrape(e, s.id)}
                  disabled={scraping[s.id] === 'loading'}
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors shrink-0 border font-medium ${
                    scraping[s.id] === 'done'    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    scraping[s.id] === 'error'   ? 'bg-red-50 border-red-200 text-red-700' :
                    scraping[s.id] === 'loading' ? 'bg-[#F5F7FA] border-[#DDE3EC] text-[#8A9BB0]' :
                    !s.last_scraped_at
                      ? 'bg-[#005BAC] border-[#005BAC] text-white hover:bg-[#004A96]'
                      : 'bg-[#F5F7FA] border-[#DDE3EC] text-[#546278] hover:border-[#BCC9D9] hover:text-[#111827]'
                  }`}
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${scraping[s.id] === 'loading' ? 'animate-spin' : ''}`} />
                  {scraping[s.id] === 'done'    ? 'En cola' :
                   scraping[s.id] === 'error'   ? 'Error' :
                   scraping[s.id] === 'loading' ? 'Enviando...' :
                   'Scrape'}
                </button>
              </div>
              {s.last_error && (
                <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded truncate border border-red-100">
                  {s.last_error}
                </p>
              )}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
