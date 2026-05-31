import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Groq from 'groq-sdk'
import { OPERATOR_KEYWORDS } from '@/lib/operators'

function detectOperators(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(OPERATOR_KEYWORDS)
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw.toLowerCase())))
    .map(([slug]) => slug)
}

export const maxDuration = 60

const BATCH_SIZE = 8

const SYSTEM_PROMPT = `Eres un analista experto en el sector Oil & Gas Argentina, especializado en Vaca Muerta, upstream, midstream, downstream, LNG, servicios petroleros y mercados de hidrocarburos.

REGLAS ESTRICTAS DE RELEVANCIA:
1. Solo el impacto DIRECTO en el sector O&G Argentina eleva el relevance_score.
2. "Retenciones al agro", política agraria, soja, maíz, trigo = relevance_score < 0.15 SIEMPRE.
3. Deportes, turismo, salud pública sin vínculo energético = relevance_score < 0.10.
4. Vaca Muerta, perforación, shale, LNG, upstream = relevance_score >= 0.60 mínimo.
5. Rystad Energy y benchmarks internacionales son SIEMPRE alta prioridad.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.`

const USER_TEMPLATE = `Analiza este artículo del sector O&G Argentina:

TÍTULO: {title}
FUENTE: {source}

CONTENIDO:
{content}

Responde con este JSON exacto:
{
  "category": "upstream|downstream|midstream|supply_chain|regulation|market|company|environment|politics|infrastructure|other",
  "subcategory": "string (máx 40 chars)",
  "sentiment": "positive|negative|neutral",
  "relevance_score": 0.0,
  "supply_chain_impact": "string o null",
  "keywords": ["kw1", "kw2", "kw3"],
  "summary": "Resumen 2-3 oraciones en español."
}

Criterios relevance_score:
- 0.0–0.15: Sin impacto O&G (agro, deportes, política no energética)
- 0.15–0.40: Impacto indirecto o contexto macroeconómico
- 0.40–0.65: Impacto moderado en operaciones o mercado O&G
- 0.65–0.85: Impacto significativo (contratos, producción, regulación energética)
- 0.85–1.00: Impacto crítico (disrupciones, Vaca Muerta, LNG, cambios regulatorios mayores)`

const VALID_CATEGORIES = new Set([
  'upstream','downstream','midstream','supply_chain','regulation',
  'market','company','environment','politics','infrastructure','other',
])

// GET: called by Vercel Cron every 5 min
export async function GET() {
  return processPending()
}

// POST: called manually from the UI
export async function POST() {
  return processPending()
}

async function processPending() {
  const db = createServerClient()
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY no configurada' }, { status: 500 })

  const groq = new Groq({ apiKey })

  // Reset articles stuck in 'parsing' for more than 10 minutes (likely from a previous timeout)
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await db.from('articles_v2')
    .update({ status: 'scraped', pipeline_started_at: null })
    .eq('status', 'parsing')
    .lt('pipeline_started_at', stuckCutoff)

  const { data: articles, error } = await db
    .from('articles_v2')
    .select('id, title, content, url, source_name')
    .eq('status', 'scraped')
    .order('scraped_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!articles?.length) return NextResponse.json({ processed: 0, message: 'No hay artículos pendientes' })

  const ids = articles.map((a: any) => a.id)
  await db.from('articles_v2')
    .update({ status: 'parsing', pipeline_started_at: new Date().toISOString() })
    .in('id', ids)

  let processed = 0
  for (const article of articles as any[]) {
    const t0 = Date.now()
    try {
      const result = await classifyArticle(groq, article)
      const elapsed = Date.now() - t0

      const isRelevant = result.relevance_score >= 0.15
      const searchText = [article.title, article.content, result.keywords.join(' '), result.summary].join(' ')
      const operatorSlugs = detectOperators(searchText)
      await db.from('articles_v2').update({
        status:                isRelevant ? 'completed' : 'irrelevant',
        category:              result.category,
        subcategory:           result.subcategory,
        sentiment:             result.sentiment,
        relevance_score:       result.relevance_score,
        supply_chain_impact:   result.supply_chain_impact ?? null,
        keywords:              result.keywords,
        summary:               result.summary,
        operator_slugs:        operatorSlugs,
        processed_at:          new Date().toISOString(),
        pipeline_completed_at: new Date().toISOString(),
        pipeline_duration_ms:  elapsed,
        error_message:         null,
      }).eq('id', article.id)

      processed++
    } catch (err) {
      await db.from('articles_v2').update({
        status:        'failed',
        error_message: String(err).slice(0, 500),
      }).eq('id', article.id)
    }
  }

  return NextResponse.json({ processed, total: articles.length })
}

async function classifyArticle(groq: Groq, article: { title: string; content: string; url: string; source_name: string }) {
  const content = (article.content || article.title || '').slice(0, 3000)
  const prompt  = USER_TEMPLATE
    .replace('{title}',   article.title    || '(sin título)')
    .replace('{source}',  article.source_name || article.url || 'desconocida')
    .replace('{content}', content)

  const resp = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    max_tokens:      800,
    temperature:     0.05,
    response_format: { type: 'json_object' },
  })

  const raw  = resp.choices[0]?.message?.content || '{}'
  return parseResult(raw)
}

function parseResult(raw: string) {
  let data: Record<string, any> = {}
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    data = m ? JSON.parse(m[0]) : {}
  } catch { /* fall through to defaults */ }

  const clamp = (v: unknown) => Math.max(0, Math.min(1, parseFloat(String(v)) || 0))

  return {
    category:            VALID_CATEGORIES.has(data.category) ? data.category : 'other',
    subcategory:         String(data.subcategory || '').slice(0, 40),
    sentiment:           ['positive','negative','neutral'].includes(data.sentiment) ? data.sentiment : 'neutral',
    relevance_score:     clamp(data.relevance_score),
    supply_chain_impact: data.supply_chain_impact || null,
    keywords:            (Array.isArray(data.keywords) ? data.keywords : []).slice(0, 10).map(String),
    summary:             String(data.summary || '').slice(0, 1000),
  }
}
