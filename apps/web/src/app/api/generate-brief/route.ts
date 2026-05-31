import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { geminiText } from '@/lib/gemini'

const SYSTEM_PROMPT = `Sos un analista senior especializado en Oil & Gas Argentina, con foco en Vaca Muerta y el sector energético patagónico.

Tu tarea es generar un brief ejecutivo diario en español, conciso, accionable y orientado a decisiones de negocio del sector O&G.

IMPORTANTE: Incluí SOLO contenido directamente relevante para Oil & Gas Argentina (exploración, producción, midstream, regulación energética, empresas del sector, precios de commodities, infraestructura). Ignorá noticias de política general, economía no energética o temas sin impacto directo en O&G.

Formato de respuesta: Markdown estructurado con las secciones indicadas.`

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const sourceIds: string[] | undefined =
      Array.isArray(body.sourceIds) && body.sourceIds.length > 0
        ? body.sourceIds
        : undefined

    const db = createServerClient()
    const today = new Date().toISOString().slice(0, 10)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    let query = db
      .from('articles_v2')
      .select('id, title, summary, category, sentiment, relevance_score, url, published_at, source_id, keywords')
      .eq('status', 'completed')
      .gte('scraped_at', since)
      .gte('relevance_score', 0.35)
      .not('category', 'in', '("politics","other")')
      .order('relevance_score', { ascending: false })
      .limit(50)

    if (sourceIds) {
      query = query.in('source_id', sourceIds)
    }

    const { data: articles, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!articles || articles.length < 3) {
      return NextResponse.json(
        { error: `Solo hay ${articles?.length ?? 0} artículos procesados. Se necesitan al menos 3.` },
        { status: 400 }
      )
    }

    // Aggregate keywords from articles as proxy for entity frequency
    const kwFreq: Record<string, number> = {}
    for (const a of articles as any[]) {
      for (const kw of (a.keywords ?? [])) {
        kwFreq[kw] = (kwFreq[kw] ?? 0) + 1
      }
    }
    const topEntities = Object.entries(kwFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, type: 'keyword', count }))

    const { data: signals } = await db
      .from('signals')
      .select('type, title, severity')
      .eq('status', 'active')
      .order('detected_at', { ascending: false })
      .limit(10)

    const articlesSummary = articles.slice(0, 30).map((a: any, i: number) =>
      `${i + 1}. [${(a.category ?? 'other').toUpperCase()} | ${a.sentiment ?? 'neutral'} | ${Math.round((a.relevance_score ?? 0) * 100)}%]\n   ${a.title}\n   ${a.summary ?? ''}`
    ).join('\n\n')

    const entitiesStr = topEntities.map(e => `- ${e.name} (${e.type}): ${e.count} menciones`).join('\n')
    const signalsStr = (signals ?? []).length > 0
      ? (signals ?? []).map((s: any) => `- [${s.severity.toUpperCase()}] ${s.title}`).join('\n')
      : 'No hay señales activas'

    const sourcesNote = sourceIds
      ? `\nFUENTES SELECCIONADAS: ${sourceIds.length} fuentes específicas`
      : '\nFUENTES: Todas las fuentes activas'

    const userPrompt = `Genera el brief ejecutivo O&G Argentina para el día ${today}.${sourcesNote}

ARTÍCULOS ANALIZADOS (${articles.length}):
${articlesSummary}

ENTIDADES MÁS MENCIONADAS:
${entitiesStr || 'Sin datos'}

SEÑALES DETECTADAS:
${signalsStr}

Genera el brief con exactamente estas secciones en Markdown:

# Brief Ejecutivo O&G Argentina — ${today}

## Resumen Ejecutivo
(3-4 párrafos con los puntos más relevantes del día para el sector Oil & Gas Argentina)

## Noticias Clave O&G
(Top 5 noticias más relevantes con bullet points, incluir categoría y nivel de impacto)

## Señales de Mercado
(Señales detectadas y su implicancia operativa. Si no hay señales, indicarlo.)

## Empresas a Monitorear
(Top 5 empresas con mayor actividad noticiosa y por qué son relevantes hoy)

## Vaca Muerta & Upstream
(Novedades específicas de exploración, producción y proyectos en Vaca Muerta)

## Recomendaciones
(3-5 acciones concretas basadas en las noticias del día)

---
*Generado por OBI | ${articles.length} artículos analizados${sourceIds ? ` | ${sourceIds.length} fuentes seleccionadas` : ''}*`

    const geminiKey = process.env['GEMINI_API_KEY']
    if (!geminiKey) throw new Error('GEMINI_API_KEY no configurada')

    const content = await geminiText(
      SYSTEM_PROMPT + '\n\n' + userPrompt,
      geminiKey,
      { temperature: 0.3, maxTokens: 4096 }
    )
    if (!content) throw new Error('No response from Gemini')

    const { error: saveError } = await db
      .from('executive_briefs')
      .upsert({
        date:              today,
        brief_type:        'daily',
        content,
        model_used:        'gemini-2.0-flash-lite',
        articles_analyzed: articles.length,
        top_entities:      topEntities,
        key_signals:       (signals ?? []).map((s: any) => ({ type: s.type, title: s.title, severity: s.severity })),
        generated_at:      new Date().toISOString(),
      }, { onConflict: 'date,brief_type' })

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

    return NextResponse.json({ ok: true, date: today, articlesAnalyzed: articles.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
