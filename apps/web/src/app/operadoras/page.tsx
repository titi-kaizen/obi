import { createServerClient } from '@/lib/supabase'
import Link from 'next/link'
import { Building2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const OPERATORS = [
  { slug: 'ypf',           name: 'YPF',                      category: 'producer',        country: 'AR', website: 'https://www.ypf.com',             description: 'Mayor productora de oil & gas de Argentina.' },
  { slug: 'pae',           name: 'Pan American Energy',       category: 'producer',        country: 'AR', website: 'https://www.pan-energy.com',      description: 'Productora privada líder, op. en Vaca Muerta y Golfo San Jorge.' },
  { slug: 'vista_energy',  name: 'Vista Energy',              category: 'producer',        country: 'AR', website: 'https://www.vistaenergy.com',     description: 'Foco en Vaca Muerta; cotiza en NYSE y BMV.' },
  { slug: 'tecpetrol',     name: 'Tecpetrol',                 category: 'producer',        country: 'AR', website: 'https://www.tecpetrol.com',       description: 'Subsidiaria del Grupo Techint; operadora en Fortín de Piedra.' },
  { slug: 'totalenergies', name: 'TotalEnergies',             category: 'integrated',      country: 'FR', website: 'https://totalenergies.com',       description: 'Integrada global con operaciones en Vaca Muerta.' },
  { slug: 'shell',         name: 'Shell Argentina',           category: 'integrated',      country: 'NL', website: 'https://www.shell.com.ar',        description: 'Integrada con presencia en exploración y downstream.' },
  { slug: 'chevron',       name: 'Chevron Argentina',         category: 'producer',        country: 'US', website: 'https://www.chevron.com',         description: 'Socio de YPF en Vaca Muerta.' },
  { slug: 'pluspetrol',    name: 'Pluspetrol',                category: 'producer',        country: 'AR', website: 'https://www.pluspetrol.net',      description: 'Productora con operaciones en cuencas argentinas.' },
  { slug: 'cgc',           name: 'CGC',                       category: 'producer',        country: 'AR', website: 'https://www.cgc.com.ar',          description: 'Compañía General de Combustibles.' },
  { slug: 'pampa',         name: 'Pampa Energía',             category: 'integrated',      country: 'AR', website: 'https://www.pampaenergia.com',    description: 'Integrada argentina: generación, transmisión y O&G.' },
  { slug: 'slb',           name: 'SLB',                       category: 'service_company', country: 'US', website: 'https://www.slb.com',             description: 'Mayor empresa de servicios oilfield del mundo.' },
  { slug: 'halliburton',   name: 'Halliburton',               category: 'service_company', country: 'US', website: 'https://www.halliburton.com',     description: 'Empresa de servicios oilfield global.' },
  { slug: 'baker_hughes',  name: 'Baker Hughes',              category: 'service_company', country: 'US', website: 'https://www.bakerhughes.com',     description: 'Tecnología y servicios para el sector energético.' },
  { slug: 'weatherford',   name: 'Weatherford',               category: 'service_company', country: 'US', website: 'https://www.weatherford.com',     description: 'Servicios y equipamiento para perforación.' },
  { slug: 'techint',       name: 'Techint',                   category: 'service_company', country: 'AR', website: 'https://www.techint.com',         description: 'Ingeniería y construcción para O&G.' },
  { slug: 'aesa',          name: 'AESA',                      category: 'service_company', country: 'AR', website: 'https://www.aesa.com.ar',         description: 'Servicios de construcción para hidrocarburos.' },
  { slug: 'sacde',         name: 'SACDE',                     category: 'service_company', country: 'AR', website: 'https://www.sacde.com',           description: 'Empresa constructora para proyectos energéticos.' },
  { slug: 'pecom',         name: 'Pecom',                     category: 'service_company', country: 'AR', website: 'https://www.pecomenergia.com.ar', description: 'Servicios industriales para petróleo y gas.' },
  { slug: 'san_antonio',   name: 'San Antonio Internacional', category: 'service_company', country: 'AR', website: 'https://www.sanantonio.com.ar',   description: 'Servicios integrales de perforación y completación.' },
  { slug: 'calfrac',       name: 'Calfrac',                   category: 'service_company', country: 'CA', website: 'https://www.calfrac.com',         description: 'Servicios de fractura hidráulica.' },
]

type Operator = typeof OPERATORS[number]

type BriefMap = Record<string, {
  operator_slug: string
  article_count: number
  avg_relevance: number | null
  dominant_sentiment: string | null
  risk_level: string | null
  brief_date: string
}>

type CountMap = Record<string, number>

const CATEGORY_LABEL: Record<string, string> = {
  producer:        'Productora',
  integrated:      'Integrada',
  service_company: 'Servicios',
}

const CATEGORY_STYLE: Record<string, string> = {
  producer:        'bg-[#E8F1FB] text-[#005BAC]',
  integrated:      'bg-violet-50 text-violet-700',
  service_company: 'bg-emerald-50 text-emerald-700',
}

const COUNTRY_FLAG: Record<string, string> = {
  AR: '🇦🇷', US: '🇺🇸', FR: '🇫🇷', NL: '🇳🇱', CA: '🇨🇦',
}

const RISK_STYLE: Record<string, string> = {
  low:    'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high:   'bg-red-50 text-red-700',
}

async function getLatestBriefs(): Promise<BriefMap> {
  const db = createServerClient()
  const { data } = await db
    .from('operator_briefs')
    .select('operator_slug, article_count, avg_relevance, dominant_sentiment, risk_level, brief_date')
    .order('brief_date', { ascending: false })
  if (!data) return {}
  const map: BriefMap = {}
  for (const row of data) {
    if (!map[row.operator_slug]) map[row.operator_slug] = row
  }
  return map
}

async function getArticleCounts(): Promise<CountMap> {
  const db = createServerClient()
  const { data } = await db
    .from('articles_v2')
    .select('operator_slugs')
    .eq('status', 'completed')
  if (!data) return {}
  const counts: CountMap = {}
  for (const row of data) {
    for (const slug of (row.operator_slugs ?? [])) {
      counts[slug] = (counts[slug] ?? 0) + 1
    }
  }
  return counts
}

function SentimentIcon({ s }: { s: string | null }) {
  if (s === 'positive') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
  if (s === 'negative') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
  return <Minus className="w-3.5 h-3.5 text-[#8A9BB0]" />
}

function OperatorCard({ op, brief, count }: { op: Operator; brief?: BriefMap[string]; count: number }) {
  return (
    <Link
      href={`/operadoras/${op.slug}`}
      className="bg-white rounded-xl border border-[#DDE3EC] p-4 hover:border-[#005BAC] hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{COUNTRY_FLAG[op.country] ?? '🌐'}</span>
          <p className="text-sm font-semibold text-[#111827] truncate group-hover:text-[#005BAC] transition-colors">
            {op.name}
          </p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${CATEGORY_STYLE[op.category]}`}>
          {CATEGORY_LABEL[op.category]}
        </span>
      </div>

      <p className="text-xs text-[#546278] line-clamp-2 mb-3 leading-relaxed">{op.description}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3 text-[#8A9BB0]" />
            <span className="text-xs text-[#546278]">{count} artículos</span>
          </div>
          {brief?.dominant_sentiment && (
            <SentimentIcon s={brief.dominant_sentiment} />
          )}
        </div>
        {brief?.risk_level && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${RISK_STYLE[brief.risk_level]}`}>
            riesgo {brief.risk_level}
          </span>
        )}
      </div>
    </Link>
  )
}

function Section({ title, operators, briefs, counts }: {
  title: string
  operators: Operator[]
  briefs: BriefMap
  counts: CountMap
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-[#546278] uppercase tracking-wider mb-3">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {operators.map(op => (
          <OperatorCard
            key={op.slug}
            op={op}
            brief={briefs[op.slug]}
            count={counts[op.slug] ?? briefs[op.slug]?.article_count ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

export default async function OperadorasPage() {
  const [latestBriefs, articleCounts] = await Promise.all([
    getLatestBriefs(),
    getArticleCounts(),
  ])

  const producers = OPERATORS.filter(o => o.category !== 'service_company')
  const services  = OPERATORS.filter(o => o.category === 'service_company')

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5">
        <h1 className="text-xl font-bold text-white">Operadoras</h1>
        <p className="text-sm text-white/60">20 compañías monitoreadas — O&G Argentina</p>
      </div>

      <div className="p-6 space-y-8">
        <Section title="Productoras e Integradas" operators={producers} briefs={latestBriefs} counts={articleCounts} />
        <Section title="Empresas de Servicios"    operators={services}  briefs={latestBriefs} counts={articleCounts} />
      </div>
    </div>
  )
}
