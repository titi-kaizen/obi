'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Newspaper,
  Radio,
  Database,
  Bell,
  FileText,
  Zap,
  Building2,
  Activity,
  BarChart3,
  HelpCircle,
} from 'lucide-react'

const nav = [
  { href: '/',           label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/articles',   label: 'Artículos',  icon: Newspaper },
  { href: '/operadoras', label: 'Operadoras', icon: Building2 },
  { href: '/market',     label: 'Mercado',    icon: BarChart3 },
  { href: '/pipeline',   label: 'Pipeline',   icon: Activity },
  { href: '/signals',    label: 'Señales',    icon: Zap },
  { href: '/sources',    label: 'Fuentes',    icon: Database },
  { href: '/alerts',     label: 'Alertas',    icon: Bell },
  { href: '/briefs',     label: 'Briefs',     icon: FileText },
  { href: '/about',      label: 'Guía',       icon: HelpCircle },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-60 shrink-0 flex flex-col bg-white border-r border-[#DDE3EC] min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#DDE3EC]">
        <div className="w-8 h-8 rounded-lg bg-[#005BAC] flex items-center justify-center">
          <Radio className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#00205B] tracking-wide">OGAS</p>
          <p className="text-[10px] text-[#546278] leading-none">O&G Argentina Scraper</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-[#E8F1FB] text-[#005BAC] font-semibold'
                  : 'text-[#546278] hover:text-[#00205B] hover:bg-[#F5F7FA]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#DDE3EC]">
        <p className="text-[10px] text-[#8A9BB0]">v0.1.0</p>
      </div>
    </aside>
  )
}
