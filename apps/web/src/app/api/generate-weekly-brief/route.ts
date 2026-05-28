import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Groq from 'groq-sdk'

const SYSTEM_PROMPT = `Eres un analista senior especializado en Oil & Gas Argentina, con foco en Vaca Muerta y el sector energético patagónico.

Tu tarea es generar un informe ejecutivo SEMANAL en español, que sintetice los eventos más importantes de la semana para el sector O&G Argentina.

A diferencia del brief diario, este informe debe identificar TENDENCIAS, PATRONES y la EVOLUCIÓN de temas a lo largo de la semana. El foco es estratégico y de mediano plazo.

Formato: Markdown estructurado.`

function getSundayDate(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0 = Sunday
  const sunday = new Date(now)
  sunday.setUTCDate(now.getUTCDate() - day)
  return sunday.toISOString().slice(0, 10)
}

function getWeekRange(): { from: string; to: string } {
  const now = new Date()
  const day = now.getUTCDay()
  const sunday = new Date(now)
  sunday.setUTCDate(now.getUTCDate() - day)
  const monday = new Date(sunday)
  monday.setUTCDate(sunday.getUTCDate() - 6)
  return {
    from: monday.toISOString().slice(0, 10),
    to:   sunday.toISOString().slice(0, 10),
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const sourceIds: string[] | undefined =
      Array.isArray(body.sourceIds) && body.sourceIds.length > 0
        ? body.sourceIds
        : undefined

    const db = createServerClient()
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const weekDate = getSundayDate()
    const { from, to } = getWeekRange()

    let query = db
      .from('articles')
      .select('id, title, summary, category, sentiment, relevance_score, url, published_at, source_id, scraped_at')
      .eq('status', 'done')
      .gte('scraped_at', since)
      .gte('relevance_score', 0.30)
      .not('category', 'in', '("politics","other")')
      .order('relevance_score', { ascending: false })
      .limit(80)

    if (sourceIds) query = query.in('source_id', sourceIds)

    const { data: articles, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!articles || articles.length < 5) {
      return NextResponse.json(
        { error: `Solo hay ${articles?.length ?? 0} artículos procesados. Se necesitan al menos 5 para el resumen semanal.` },
        { status: 400 }
      )
    }

    const articleIds = articles.map((a: any) => a.id)

    const [entityData, signals] = await Promise.all([
      db.from('article_entities')
        .select('entity:entities(name, type)')
        .in('article_id', articleIds)
        .limit(500),
      db.from('signals')
        .select('type, title, severity, detected_at')
        .gte('detected_at', since)
        .order('detected_at', { ascending: false })
        .limit(20),
    ])

    const entityFreq: Record<string, { name: string; type: string; count: number }> = {}
    for (const row of entityData.data ?? []) {
      const entity = (Array.isArray(row.entity) ? row.entity[0] : row.entity) as { name: string; type: string } | null
      if (!entity) continue
      if (!entityFreq[entity.name]) entityFreq[entity.name] = { name: entity.name, type: entity.type, count: 0 }
      entityFreq[entity.name].count++
    }
    const topEntities = Object.values(entityFreq).sort((a, b) => b.count - a.count).slice(0, 20)

    // Category distribution for trend analysis
    const catCount: Record<string, number> = {}
    for (const a of articles) {
      const cat = (a as any).category ?? 'other'
      catCount[cat] = (catCount[cat] ?? 0) + 1
    }
    const categoryBreakdown = Object.entries(catCount)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `${cat}: ${n} artículos`)
      .join(', ')

    const articlesSummary = articles.slice(0, 50).map((a: any, i: number) =>
      `${i + 1}. [${(a.category ?? 'other').toUpperCase()} | ${a.sentiment ?? 'neutral'} | ${Math.round((a.relevance_score ?? 0) * 100)}%]\n   ${a.title}\n   ${a.summary ?? ''}`
    ).join('\n\n')

    const entitiesStr = topEntities.map(e => `- ${e.name} (${e.type}): ${e.count} menciones`).join('\n')
    const signalsStr = (signals.data ?? []).length > 0
      ? (signals.data ?? []).map((s: any) => `- [${s.severity.toUpperCase()}] ${s.title}`).join('\n')
      : 'No se detectaron señales activas esta semana'

    const sourcesNote = sourceIds
      ? `\nFUENTES SELECCIONADAS: ${sourceIds.length} fuentes específicas`
      : '\nFUENTES: Todas las fuentes activas'

    const userPrompt = `Genera el INFORME EJECUTIVO SEMANAL O&G Argentina para la semana del ${from} al ${to}.${sourcesNote}

ESTADÍSTICAS DE LA SEMANA:
- Total artículos analizados: ${articles.length}
- Distribución por categoría: ${categoryBreakdown}

ARTÍCULOS DE LA SEMANA (ordenados por relevancia):
${articlesSummary}

ENTIDADES MÁS MENCIONADAS DURANTE LA SEMANA:
${entitiesStr || 'Sin datos'}

SEÑALES DETECTADAS DURANTE LA SEMANA:
${signalsStr}

Genera el informe con exactamente estas secciones en Markdown:

# Informe Semanal O&G Argentina — Semana del ${from} al ${to}

## Resumen Ejecutivo de la Semana
(4-5 párrafos sintetizando los temas dominantes de la semana, con perspectiva estratégica)

## Eventos Clave de la Semana
(Top 7 noticias más importantes de la semana con contexto e impacto en el sector)

## Tendencias Observadas
(2-4 tendencias o patrones identificados a lo largo de la semana, qué implican para el sector)

## Vaca Muerta & Upstream
(Resumen semanal de actividad en exploración, producción y proyectos en Vaca Muerta)

## Empresas Más Activas
(Top 5-7 empresas con mayor actividad noticiosa esta semana y por qué son relevantes)

## Señales de Mercado
(Señales detectadas, su evolución durante la semana y sus implicancias)

## Outlook Próxima Semana
(3-5 temas o eventos a monitorear la semana siguiente)

---
*Informe Semanal OBI | Semana ${from}/${to} | ${articles.length} artículos analizados${sourceIds ? ` | ${sourceIds.length} fuentes` : ''}*`

    const groq = new Groq({ apiKey: process.env['GROQ_API_KEY'] })

    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  6000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    if (!content) throw new Error('No response from Groq')

    const { error: saveError } = await db
      .from('executive_briefs')
      .upsert({
        date:              weekDate,
        brief_type:        'weekly',
        content,
        model_used:        'llama-3.3-70b-versatile',
        articles_analyzed: articles.length,
        top_entities:      topEntities,
        key_signals:       (signals.data ?? []).map((s: any) => ({ type: s.type, title: s.title, severity: s.severity })),
        generated_at:      new Date().toISOString(),
      }, { onConflict: 'date,brief_type' })

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

    return NextResponse.json({ ok: true, date: weekDate, articlesAnalyzed: articles.length, weekRange: { from, to } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
