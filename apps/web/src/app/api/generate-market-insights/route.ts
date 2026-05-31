import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Groq from 'groq-sdk'

export const maxDuration = 60

export async function POST() {
  const db     = createServerClient()
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY no configurada' }, { status: 500 })

  const since90d = new Date(Date.now() - 90 * 86400_000).toISOString()
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString()

  const [contractsRes, articlesRes] = await Promise.all([
    db.from('contract_events')
      .select('fecha, operadora, proveedor, categoria, tipo_evento, monto, moneda, proyecto, titulo_noticia, resumen')
      .gte('fecha', since90d.slice(0, 10))
      .order('fecha', { ascending: false })
      .limit(50),
    db.from('articles_v2')
      .select('title, category, sentiment, relevance_score, keywords, summary')
      .eq('status', 'completed')
      .gte('scraped_at', since30d)
      .gte('relevance_score', 0.5)
      .order('relevance_score', { ascending: false })
      .limit(30),
  ])

  const contracts = contractsRes.data ?? []
  const articles  = articlesRes.data  ?? []

  if (articles.length < 3 && contracts.length === 0) {
    return NextResponse.json({ error: 'Datos insuficientes. Procesá más artículos primero.' }, { status: 400 })
  }

  const contractsSummary = contracts.slice(0, 25).map((c: any) =>
    `• [${c.fecha}] ${(c.tipo_evento ?? 'evento').toUpperCase()} | ${c.operadora ?? '?'} → ${c.proveedor ?? '?'} | cat: ${c.categoria}${c.monto ? ` | $${(c.monto / 1_000_000).toFixed(1)}M ${c.moneda ?? ''}` : ''}: ${c.titulo_noticia ?? ''}`
  ).join('\n')

  const articlesSummary = articles.slice(0, 20).map((a: any) =>
    `• [${a.category}/${a.sentiment}/${Math.round((a.relevance_score ?? 0) * 100)}%] ${a.title}: ${a.summary ?? ''}`
  ).join('\n')

  const prompt = `Sos un analista senior de Supply Chain & Planeamiento Estratégico especializado en Oil & Gas Argentina.

Analizá los siguientes datos del mercado O&G Argentina de los últimos 90 días y generá insights estratégicos concisos y accionables.

CONTRATOS E INVERSIONES DETECTADOS (últimos 90 días):
${contractsSummary || '(sin eventos contractuales detectados aún — el pipeline de extracción está en proceso)'}

NOTICIAS MÁS RELEVANTES (últimos 30 días):
${articlesSummary || '(sin noticias relevantes)'}

Generá exactamente este JSON:
{
  "insights": [
    {
      "titulo": "Título conciso (máx 60 chars)",
      "descripcion": "2-3 oraciones con análisis e implicancia para supply chain/costos",
      "tipo": "presion_costos|tendencia|oportunidad|riesgo|actividad_operadora",
      "impacto": "alto|medio|bajo",
      "categoria_afectada": "perforacion|gasoductos|logistica|etc o null"
    }
  ],
  "outlook": "Párrafo 3-4 oraciones con outlook de mercado para próximas 4-8 semanas desde perspectiva de supply chain y costos"
}

REGLAS:
- Generá entre 4 y 7 insights.
- Focalizate en: presión sobre costos, demanda futura de servicios, riesgo cuello de botella, tendencias competitivas.
- NO inventés precios o montos que no estén en los datos.
- Si hay pocos datos contractuales, basate en las noticias y señalá la limitación con honestidad.`

  const groq = new Groq({ apiKey })
  const resp = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  2000,
    temperature: 0.3,
    messages:    [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  })

  let result: Record<string, any> = {}
  try {
    const raw = resp.choices[0]?.message?.content ?? '{}'
    const m = raw.match(/\{[\s\S]*\}/)
    result = m ? JSON.parse(m[0]) : {}
  } catch { result = { insights: [], outlook: '' } }

  return NextResponse.json({
    insights:    Array.isArray(result.insights) ? result.insights : [],
    outlook:     String(result.outlook ?? ''),
    generatedAt: new Date().toISOString(),
    dataPoints:  { contracts: contracts.length, articles: articles.length },
  })
}
