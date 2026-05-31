'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'

const INTERVAL_MS = 30_000

export default function RefreshButton() {
  const router = useRouter()
  const [spinning, setSpinning] = useState(false)
  const [countdown, setCountdown] = useState(INTERVAL_MS / 1000)

  useEffect(() => {
    // Count down every second
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          router.refresh()
          return INTERVAL_MS / 1000
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [router])

  function refresh() {
    setSpinning(true)
    setCountdown(INTERVAL_MS / 1000)
    router.refresh()
    setTimeout(() => setSpinning(false), 1000)
  }

  return (
    <button
      onClick={refresh}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />
      Actualizar <span className="opacity-50">{countdown}s</span>
    </button>
  )
}
