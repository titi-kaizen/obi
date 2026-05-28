export const BRIEF_SYSTEM_PROMPT = `Eres un analista senior de Supply Chain en el sector Oil & Gas Argentina, experto en inteligencia de mercado y planificación estratégica.

Tu tarea es generar un brief ejecutivo diario en español, conciso, accionable y orientado a decisiones de negocio.

Formato de respuesta: Markdown estructurado con las secciones indicadas.`

export interface BriefContext {
  date: string
  articles: Array<{
    title: string
    summary: string
    category: string
    sentiment: string
    relevanceScore: number
    url: string
    publishedAt: string | null
  }>
  topEntities: Array<{ name: string; type: string; count: number }>
  activeSignals: Array<{ type: string; title: string; severity: string }>
}

export function buildBriefPrompt(ctx: BriefContext): string {
  const { date, articles, topEntities, activeSignals } = ctx

  const articlesSummary = articles
    .slice(0, 30) // limit context size
    .map((a, i) =>
      `${i + 1}. [${a.category.toUpperCase()} | ${a.sentiment} | SC: ${Math.round(a.relevanceScore * 100)}%]
   ${a.title}
   ${a.summary}`
    )
    .join('\n\n')

  const entitiesStr = topEntities
    .slice(0, 15)
    .map((e) => `- ${e.name} (${e.type}): ${e.count} menciones`)
    .join('\n')

  const signalsStr = activeSignals.length > 0
    ? activeSignals
        .map((s) => `- [${s.severity.toUpperCase()}] ${s.title}`)
        .join('\n')
    : 'No hay señales activas'

  return `Genera el brief ejecutivo diario de inteligencia O&G Supply Chain Argentina para el día ${date}.

ARTÍCULOS ANALIZADOS (${articles.length}):
${articlesSummary}

ENTIDADES MÁS MENCIONADAS:
${entitiesStr || 'Sin datos'}

SEÑALES DETECTADAS:
${signalsStr}

Genera el brief con exactamente estas secciones en Markdown:

# Brief Ejecutivo OGASCI — ${date}

## Resumen Ejecutivo
(3-4 párrafos con los puntos más relevantes del día para Supply Chain O&G Argentina)

## Noticias Clave
(Top 5 noticias más relevantes con bullet points, incluir categoría y nivel de impacto)

## Señales de Supply Chain
(Señales detectadas y su implicancia operativa. Si no hay señales, indicarlo.)

## Empresas a Monitorear
(Top 5 empresas con mayor actividad noticiosa y por qué son relevantes hoy)

## Tendencias del Mercado
(Análisis de tendencias: precios, regulación, infraestructura, demanda)

## Recomendaciones Estratégicas
(3-5 acciones concretas para equipos de Supply Chain basadas en las noticias del día)

---
*Generado automáticamente por OGASCI | ${articles.length} artículos analizados*`
}
