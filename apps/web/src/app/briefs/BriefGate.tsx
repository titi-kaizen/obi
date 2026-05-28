'use client'

import { useState, useEffect } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'

const STORAGE_KEY = 'brief_auth'
const CORRECT    = 'PE2026'

export default function BriefGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked]   = useState(false)
  const [hydrated, setHydrated]   = useState(false)
  const [password, setPassword]   = useState('')
  const [showPw,   setShowPw]     = useState(false)
  const [error,    setError]      = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === CORRECT) setUnlocked(true)
    setHydrated(true)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password === CORRECT) {
      localStorage.setItem(STORAGE_KEY, CORRECT)
      setUnlocked(true)
      setError(false)
    } else {
      setError(true)
      setPassword('')
    }
  }

  if (hydrated && unlocked) return <>{children}</>

  return (
    <div className="flex items-center justify-center min-h-full p-6 bg-[#F5F7FA]">
      <div className="w-full max-w-sm">
        {/* YPF-style top accent bar */}
        <div className="h-1 w-full bg-[#005BAC] rounded-t-xl" />
        <div className="bg-white rounded-b-xl border border-[#DDE3EC] border-t-0 p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-[#E8F1FB] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-[#005BAC]" />
            </div>
            <h2 className="text-lg font-bold text-[#111827]">Acceso restringido</h2>
            <p className="text-sm text-[#546278]">Ingresá la contraseña para ver los briefs</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false) }}
                placeholder="Contraseña"
                autoFocus
                className={`w-full bg-[#F5F7FA] border rounded-lg px-4 py-2.5 text-sm text-[#111827] placeholder-[#8A9BB0] outline-none pr-10 transition-colors ${
                  error
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-[#DDE3EC] focus:border-[#005BAC]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A9BB0] hover:text-[#546278] transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-600 text-center">Contraseña incorrecta</p>
            )}

            <button
              type="submit"
              className="w-full bg-[#005BAC] hover:bg-[#004A96] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
