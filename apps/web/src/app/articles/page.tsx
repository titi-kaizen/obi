import { createServerClient } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Newspaper, ExternalLink } from 'lucide-react'

const CATEGORY_COLORS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
  done:       'bg-emerald-50 text-emerald-700',
  pending:    'bg-amber-50 text-amber-700',
  processing: 'bg-blue-50 text-blue-700',
  failed:     'bg-red-50 text-red-700',
}

const SENTIMENT_ICONS: Record<string, string> = {
  positive: '↑',
  negative: '↓',
  neutral:  '→',
}

async function getArticles(status?: string, category?: string) {
  const db = createServerClient()
  let q = db
    .from('articles')
    .select('id, title, url, published_at, scraped_at, status, category, sentiment, relevance_score, keywords, sources(name, category)')
    .order('scraped_at', { ascending: false })
    .limit(50)

  if (status)   q = q.eq('status', status)
  if (category) q = q.eq('category', category)

  const { data } = await q
  return data ?? []
}

async function getStatusCounts() {
  const db = createServerClient()
  const { data } = await db.from('articles').select('status')
  if (!data) return {}
  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}

function ago(d: string | null) {
  if (!d) return '—'
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: es })
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>
}) {
  const params = await searchParams
  const [articles, counts] = await Promise.all([
    getArticles(params.status, params.category),
    getStatusCounts(),
  ])

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-white/60" /> Artículos
        </h1>
        <p className="text-sm text-white/60">Feed de noticias capturadas y procesadas</p>
      </div>
    <div className="p-6 space-y-6">

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          [undefined,    'Todos'],
          ['done',       'Procesados'],
          ['pending',    'Pendientes'],
          ['processing', 'Procesando'],
          ['failed',     'Fallidos'],
        ] as [string | undefined, string][]).map(([s, label]) => (
          <a
            key={s ?? 'all'}
            href={s ? `/articles?status=${s}` : '/articles'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              params.status === s || (!params.status && !s)
                ? 'bg-[#E8F1FB] text-[#005BAC] border-[#BDD4F0] font-semibold'
                : 'bg-white text-[#546278] border-[#DDE3EC] hover:text-[#111827] hover:border-[#BCC9D9]'
            }`}
          >
            {label}
            {s && counts[s] != null && (
              <span className="ml-1.5 text-[#8A9BB0]">{counts[s]}</span>
            )}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#DDE3EC] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#DDE3EC] text-xs text-[#546278] uppercase tracking-wide bg-[#F5F7FA]">
              <th className="text-left px-4 py-3 font-semibold">Título</th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Fuente</th>
              <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Categoría</th>
              <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Sent.</th>
              <th className="text-left px-4 py-3 font-semibold hidden xl:table-cell">Rel.</th>
              <th className="text-left px-4 py-3 font-semibold">Estado</th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Capturado</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDE3EC]">
            {articles.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[#8A9BB0]">
                  Sin artículos{params.status ? ` con estado "${params.status}"` : ''}
                </td>
              </tr>
            ) : articles.map((a: any) => (
              <tr key={a.id} className="hover:bg-[#F5F7FA] transition-colors">
                <td className="px-4 py-3 max-w-xs">
                  <p className="text-[#374151] text-xs leading-snug line-clamp-2 font-medium">{a.title ?? 'Sin título'}</p>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <p className="text-xs text-[#546278] truncate max-w-[120px]">
                    {(a.sources as any)?.name ?? '—'}
                  </p>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {a.category ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[a.category] ?? CATEGORY_COLORS.other}`}>
                      {a.category}
                    </span>
                  ) : <span className="text-[#BCC9D9]">—</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-sm font-semibold">
                  {a.sentiment ? (
                    <span className={
                      a.sentiment === 'positive' ? 'text-emerald-600' :
                      a.sentiment === 'negative' ? 'text-red-500' : 'text-[#8A9BB0]'
                    }>
                      {SENTIMENT_ICONS[a.sentiment]}
                    </span>
                  ) : <span className="text-[#BCC9D9]">—</span>}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-xs text-[#546278]">
                  {a.relevance_score != null ? `${(a.relevance_score * 100).toFixed(0)}%` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[a.status] ?? ''}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs text-[#8A9BB0]">
                  {ago(a.scraped_at)}
                </td>
                <td className="px-4 py-3">
                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                    className="text-[#BCC9D9] hover:text-[#005BAC] transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  )
}
