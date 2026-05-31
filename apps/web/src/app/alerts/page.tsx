import { createServerClient } from '@/lib/supabase'
import { Bell, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getAlerts() {
  const db = createServerClient()
  const { data } = await db
    .from('alert_rules')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function AlertsPage() {
  const alerts = await getAlerts()

  return (
    <div className="flex flex-col">
      <div className="bg-[#00205B] px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-white/60" /> Alertas
          </h1>
          <p className="text-sm text-white/60">Reglas de notificación por email, Slack o webhook</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 bg-white text-[#00205B] rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors">
          <Plus className="w-4 h-4" /> Nueva alerta
        </button>
      </div>
    <div className="p-6 space-y-6">

      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#DDE3EC] py-12 px-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#E8F1FB] flex items-center justify-center mx-auto mb-4">
            <Bell className="w-6 h-6 text-[#005BAC]" />
          </div>
          <p className="text-[#111827] font-semibold text-sm mb-1">No hay alertas configuradas</p>
          <p className="text-[#546278] text-xs max-w-sm mx-auto mb-4">
            Las alertas te notifican por email, Slack o webhook cuando se detectan señales de alto impacto en el sector O&G.
          </p>
          <button className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#005BAC] text-white rounded-lg text-sm font-semibold hover:bg-[#004A96] transition-colors">
            <Plus className="w-4 h-4" /> Crear primera alerta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((a: any) => (
            <div key={a.id} className="bg-white rounded-xl border border-[#DDE3EC] p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#111827]">{a.name}</p>
                  {a.description && (
                    <p className="text-xs text-[#546278] mt-1">{a.description}</p>
                  )}
                </div>
                <div className={`w-2 h-2 rounded-full mt-1.5 ${a.is_active ? 'bg-emerald-500' : 'bg-[#BCC9D9]'}`} />
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs text-[#8A9BB0]">
                <span>{a.trigger_count} disparos</span>
                {a.last_triggered_at && (
                  <>
                    <span>·</span>
                    <span>último: {new Date(a.last_triggered_at).toLocaleDateString('es-AR')}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  )
}
