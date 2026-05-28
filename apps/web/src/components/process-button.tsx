'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cpu, CheckCircle, AlertCircle } from 'lucide-react'

export default function ProcessButton({ pendingCount }: { pendingCount: number }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function trigger() {
    setState('loading')
    try {
      const res = await fetch('/api/process-pending', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setMessage(data.message)
      setState('done')
      setTimeout(() => { setState('idle'); router.refresh() }, 3000)
    } catch (err) {
      setMessage(String(err))
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  if (pendingCount === 0) return null

  return (
    <button
      onClick={trigger}
      disabled={state === 'loading'}
      title={message || undefined}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
        state === 'done'  ? 'bg-green-50 border-green-200 text-green-700' :
        state === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
        'bg-[#E8F1FB] border-[#BDD4F0] text-[#005BAC] hover:bg-[#D4E7F8] disabled:opacity-50'
      }`}
    >
      {state === 'done'    ? <CheckCircle className="w-3.5 h-3.5" /> :
       state === 'error'   ? <AlertCircle className="w-3.5 h-3.5" /> :
       <Cpu className={`w-3.5 h-3.5 ${state === 'loading' ? 'animate-pulse' : ''}`} />}
      {state === 'loading' ? 'Verificando...' :
       state === 'done'    ? 'Listo' :
       state === 'error'   ? 'Error' :
       `${pendingCount} pendientes`}
    </button>
  )
}
