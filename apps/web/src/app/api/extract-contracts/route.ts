import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Groq from 'groq-sdk'
import { hasContractSignals, extractContractFromArticle } from '@/lib/contract-extraction'

export const maxDuration = 60

const BATCH_SIZE = 8

export async function GET() { return runExtraction() }
export async function POST() { return runExtraction() }

async function runExtraction() {
  const db = createServerClient()
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY no configurada' }, { status: 500 })
  const groq = new Groq({ apiKey })

  // Find article_ids already extracted so we don't double-process
  const { data: existing } = await db
    .from('contract_events')
    .select('article_id')
    .not('article_id', 'is', null)
    .limit(2000)

  const alreadyDone = new Set((existing ?? []).map((r: any) => r.article_id))

  const { data: articles, error } = await db
    .from('articles_v2')
    .select('id, title, content, url, source_name, published_at')
    .eq('status', 'completed')
    .gte('relevance_score', 0.30)
    .order('scraped_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const candidates = (articles ?? []).filter(
    (a: any) => !alreadyDone.has(a.id) && hasContractSignals((a.title ?? '') + ' ' + (a.content ?? ''))
  )

  if (!candidates.length) {
    return NextResponse.json({ extracted: 0, skipped: 0, message: 'Sin candidatos nuevos' })
  }

  const batch = candidates.slice(0, BATCH_SIZE)
  let extracted = 0
  let skipped   = 0

  for (const article of batch as any[]) {
    try {
      const result = await extractContractFromArticle(groq, article)
      if (!result) { skipped++; continue }

      const fecha = article.published_at
        ? new Date(article.published_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      await db.from('contract_events').insert({
        article_id:     article.id,
        fecha,
        operadora:      result.operadora,
        proveedor:      result.proveedor,
        categoria:      result.categoria,
        tipo_evento:    result.tipo_evento,
        monto:          result.monto,
        moneda:         result.moneda,
        proyecto:       result.proyecto,
        ubicacion:      result.ubicacion,
        capacidad:      result.capacidad,
        plazo:          result.plazo,
        confianza:      result.confianza,
        fuente:         article.source_name,
        titulo_noticia: article.title,
        resumen:        result.resumen_evento,
      })
      extracted++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({
    extracted,
    skipped,
    candidates: candidates.length,
    processed:  batch.length,
  })
}
