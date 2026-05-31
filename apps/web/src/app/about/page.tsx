import { APP_DOCS, APP_OVERVIEW } from '@/lib/app-docs'
import {
  LayoutDashboard, Newspaper, Building2, BarChart3, FileText,
  Zap, Database, Bell, Activity, HelpCircle,
  CheckCircle2, Clock, FlaskConical, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

const ICONS: Record<string, React.ElementType> = {
  LayoutDashboard, Newspaper, Building2, BarChart3, FileText,
  Zap, Database, Bell, Activity,
}

const STATUS_CONFIG = {
  live:         { label: 'Activo',      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  beta:         { label: 'Beta',        classes: 'bg-amber-50  text-amber-700  border-amber-200',  Icon: FlaskConical  },
  coming_soon:  { label: 'Próximamente',classes: 'bg-[#E8F1FB] text-[#005BAC] border-[#BDD4F0]',  Icon: Clock         },
}

export default function AboutPage() {
  const live = APP_DOCS.filter(s => s.status === 'live').length
  const beta = APP_DOCS.filter(s => s.status === 'beta').length

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-[#00205B] px-6 py-5">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="w-5 h-5 text-white/60" />
          <h1 className="text-xl font-bold text-white">Guía de la plataforma</h1>
        </div>
        <p className="text-sm text-white/60">Qué hace cada módulo y cómo sacarle el máximo provecho</p>
      </div>

      <div className="p-6 space-y-8 max-w-5xl">
        {/* Overview card */}
        <div className="bg-white rounded-xl border border-[#DDE3EC] overflow-hidden">
          <div className="px-6 py-5 border-b border-[#DDE3EC] bg-[#F5F7FA]">
            <p className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-1">¿Qué es OGAS?</p>
            <h2 className="text-lg font-bold text-[#111827]">{APP_OVERVIEW.tagline}</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            {APP_OVERVIEW.description.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm text-[#546278] leading-relaxed">{para}</p>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {APP_OVERVIEW.stack.map(item => (
                <span key={item} className="text-xs px-2.5 py-1 bg-[#F5F7FA] border border-[#DDE3EC] rounded-lg text-[#546278]">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="px-6 py-3 border-t border-[#DDE3EC] bg-[#F5F7FA] flex items-center gap-4">
            <span className="text-xs text-[#546278]">{APP_DOCS.length} módulos</span>
            <span className="text-[#DDE3EC]">·</span>
            <span className="text-xs text-emerald-700">{live} activos</span>
            {beta > 0 && <>
              <span className="text-[#DDE3EC]">·</span>
              <span className="text-xs text-amber-700">{beta} en beta</span>
            </>}
          </div>
        </div>

        {/* Module cards */}
        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-[#546278] uppercase tracking-wider">Módulos</h2>

          {APP_DOCS.map(section => {
            const Icon        = ICONS[section.icon] ?? HelpCircle
            const statusCfg   = STATUS_CONFIG[section.status]
            const StatusIcon  = statusCfg.Icon

            return (
              <div key={section.id} className="bg-white rounded-xl border border-[#DDE3EC] overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-[#DDE3EC] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#E8F1FB] flex items-center justify-center shrink-0">
                      <Icon className="w-4.5 h-4.5 text-[#005BAC]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#111827]">{section.title}</p>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusCfg.classes}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-[#546278]">{section.subtitle}</p>
                    </div>
                  </div>
                  <Link
                    href={section.path}
                    className="flex items-center gap-1 text-xs text-[#005BAC] hover:text-[#004A96] font-medium shrink-0"
                  >
                    Ir al módulo <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Card body */}
                <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Description */}
                  <div>
                    <p className="text-[10px] font-semibold text-[#8A9BB0] uppercase tracking-wider mb-2">Qué es</p>
                    <p className="text-xs text-[#546278] leading-relaxed">{section.description}</p>
                  </div>

                  {/* How it works */}
                  <div>
                    <p className="text-[10px] font-semibold text-[#8A9BB0] uppercase tracking-wider mb-2">Cómo funciona</p>
                    <ul className="space-y-1.5">
                      {section.howItWorks.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-[#546278]">
                          <span className="text-[#BCC9D9] mt-0.5 shrink-0">→</span>
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Use cases */}
                  <div>
                    <p className="text-[10px] font-semibold text-[#8A9BB0] uppercase tracking-wider mb-2">Para qué sirve</p>
                    <ul className="space-y-1.5">
                      {section.useCases.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-[#546278]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="px-5 py-2 border-t border-[#DDE3EC] bg-[#F5F7FA]">
                  <p className="text-[10px] text-[#8A9BB0]">Actualizado: {section.updatedAt}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
