import { createServerClient } from '@/lib/supabase'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { FileText, Calendar, Cpu, CalendarDays } from 'lucide-react'
import GenerateBriefButton from '@/components/generate-brief-button'
import GenerateWeeklyBriefButton from '@/components/generate-weekly-brief-button'
import RefreshButton from '@/components/refresh-button'
import BriefGate from './BriefGate'

async function getBriefs(type?: string) {
  const db = createServerClient()
  let q = db
    .from('executive_briefs')
    .select('id, date, brief_type, content_html, content, model_used, articles_analyzed, top_entities, key_signals, generated_at')
    .order('date', { ascending: false })
    .limit(50)
  if (type === 'daily')  q = q.eq('brief_type', 'daily')
  if (type === 'weekly') q = q.eq('brief_type', 'weekly')
  const { data } = await q
  return data ?? []
}

function weekRangeLabel(dateStr: string) {
  const d = new Date(dateStr)
  const mon = startOfWeek(d, { weekStartsOn: 1 })
  const sun = endOfWeek(d, { weekStartsOn: 1 })
  return `${format(mon, "d MMM", { locale: es })} – ${format(sun, "d MMM yyyy", { locale: es })}`
}

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const params = await searchParams
  const activeType = params.type  // undefined = all, 'daily', 'weekly'
  const briefs = await getBriefs(activeType)

  return (
    <BriefGate>
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-white/60" /> Briefs ejecutivos
          </h1>
          <p className="text-sm text-white/60">Resúmenes diarios y semanales generados por IA sobre el sector O&G Argentina</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <GenerateWeeklyBriefButton />
          <GenerateBriefButton />
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Type filter tabs */}
        <div className="flex gap-2">
          {([
            [undefined,  'Todos'],
            ['daily',    'Diarios'],
            ['weekly',   'Semanales'],
          ] as [string | undefined, string][]).map(([t, label]) => (
            <a
              key={t ?? 'all'}
              href={t ? `/briefs?type=${t}` : '/briefs'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                activeType === t || (!activeType && !t)
                  ? 'bg-[#E8F1FB] text-[#005BAC] border-[#BDD4F0] font-semibold'
                  : 'bg-white text-[#546278] border-[#DDE3EC] hover:text-[#111827] hover:border-[#BCC9D9]'
              }`}
            >
              {label}
            </a>
          ))}
        </div>

        {briefs.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#DDE3EC] py-16 text-center">
            <FileText className="w-8 h-8 text-[#BCC9D9] mx-auto mb-3" />
            <p className="text-[#546278] text-sm">No hay briefs generados todavía</p>
            <p className="text-[#8A9BB0] text-xs mt-1">
              Los briefs diarios se generan a las 7:00 AM · Los semanales los domingos a las 20:00
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {briefs.map((b: any) => {
              const isWeekly = b.brief_type === 'weekly'
              return (
                <div
                  key={b.id}
                  className={`bg-white rounded-xl border overflow-hidden ${
                    isWeekly ? 'border-[#005BAC]/30' : 'border-[#DDE3EC]'
                  }`}
                >
                  {/* Header */}
                  <div className={`px-5 py-4 border-b flex items-center justify-between ${
                    isWeekly
                      ? 'bg-[#E8F1FB] border-[#BDD4F0]'
                      : 'bg-[#F5F7FA] border-[#DDE3EC]'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isWeekly ? 'bg-[#005BAC]' : 'bg-[#E8F1FB]'
                      }`}>
                        {isWeekly
                          ? <CalendarDays className="w-4 h-4 text-white" />
                          : <Calendar className="w-4 h-4 text-[#005BAC]" />
                        }
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#111827] capitalize">
                            {isWeekly
                              ? `Semana ${weekRangeLabel(b.date)}`
                              : format(new Date(b.date), "EEEE d 'de' MMMM yyyy", { locale: es })
                            }
                          </p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            isWeekly
                              ? 'bg-[#005BAC] text-white'
                              : 'bg-[#DDE3EC] text-[#546278]'
                          }`}>
                            {isWeekly ? 'SEMANAL' : 'DIARIO'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#546278]">
                          <Cpu className="w-3 h-3" />
                          <span>{b.model_used}</span>
                          <span>·</span>
                          <span>{b.articles_analyzed} artículos analizados</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-5 py-5">
                    {b.content_html ? (
                      <div
                        className="text-sm text-[#374151] leading-relaxed prose prose-sm max-w-none
                          prose-headings:text-[#111827] prose-headings:font-bold
                          prose-a:text-[#005BAC] prose-strong:text-[#111827]
                          prose-li:text-[#374151]"
                        dangerouslySetInnerHTML={{ __html: b.content_html }}
                      />
                    ) : (
                      <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">{b.content}</p>
                    )}
                  </div>

                  {/* Footer with entities */}
                  {b.top_entities?.length > 0 && (
                    <div className="px-5 py-3 border-t border-[#DDE3EC] flex gap-2 flex-wrap bg-[#F5F7FA]">
                      {b.top_entities.slice(0, isWeekly ? 8 : 5).map((e: any, i: number) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded font-medium ${
                          isWeekly ? 'bg-[#005BAC]/10 text-[#005BAC]' : 'bg-[#E8F1FB] text-[#005BAC]'
                        }`}>
                          {typeof e === 'string' ? e : e.name ?? JSON.stringify(e)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </BriefGate>
  )
}
