'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { SOURCES_STORAGE_KEY } from '@/app/sources/SourcesClient'

export default function GenerateBriefButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function generate() {
    setState('loading')
    setMessage('')
    try {
      let sourceIds: string[] | undefined
      try {
        const stored = localStorage.getItem(SOURCES_STORAGE_KEY)
        if (stored) {
          const ids = JSON.parse(stored) as string[]
          if (ids.length > 0) sourceIds = ids
        }
      } catch { /* ignore */ }

      const res = await fetch('/api/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setMessage(`Brief generado — ${data.articlesAnalyzed} artículos analizados`)
      setState('done')
      setTimeout(() => { setState('idle'); router.refresh() }, 5000)
    } catch (err) {
      setMessage(String(err))
      setState('error')
      setTimeout(() => setState('idle'), 5000)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={generate}
        disabled={state === 'loading'}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
          state === 'done'  ? 'bg-green-50 border-green-200 text-green-700' :
          state === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
          'bg-white border-white/30 text-[#00205B] hover:bg-white/90 disabled:opacity-60'
        }`}
      >
        {state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> :
         state === 'done'    ? <CheckCircle className="w-4 h-4" /> :
         state === 'error'   ? <AlertCircle className="w-4 h-4" /> :
         <FileText className="w-4 h-4" />}
        {state === 'loading' ? 'Generando...' :
         state === 'done'    ? 'Listo' :
         state === 'error'   ? 'Error' :
         'Generar brief'}
      </button>
      {message && (
        <p className={`text-xs max-w-xs text-right ${state === 'error' ? 'text-red-300' : 'text-white/70'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
