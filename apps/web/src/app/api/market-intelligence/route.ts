import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface PressureResult {
  score: number
  label: string
  color: string
  breakdown: Record<string, number>
}

function calcPressureIndex(p: {
  contracts30d: number
  investments30d: number
  upstream30d: number
  operatorsActive: number
  highRelevance30d: number
}): PressureResult {
  const contractScore  = Math.min(25, (p.contracts30d   / 8)  * 25)
  const investScore    = Math.min(20, (p.investments30d  / 5)  * 20)
  const upstreamScore  = Math.min(20, (p.upstream30d     / 15) * 20)
  const operatorScore  = Math.min(15, (p.operatorsActive / 6)  * 15)
  const relevanceScore = Math.min(20, (p.highRelevance30d/ 20) * 20)

  const score = Math.round(contractScore + investScore + upstreamScore + operatorScore + relevanceScore)

  const label =
    score >= 80 ? 'Mercado Sobrecalentado' :
    score >= 60 ? 'Presión Creciente'       :
    score >= 30 ? 'Normal'                   :
    'Mercado Frío'

  const color =
    score >= 80 ? '#DC2626' :
    score >= 60 ? '#D97706' :
    score >= 30 ? '#059669' :
    '#6B7280'

  return {
    score,
    label,
    color,
    breakdown: {
      contratos:   Math.round(contractScore),
      inversiones: Math.round(investScore),
      upstream:    Math.round(upstreamScore),
      operadoras:  Math.round(operatorScore),
      relevancia:  Math.round(relevanceScore),
    },
  }
}

export async function GET() {
  const db     = createServerClient()
  const since30d = new Date(Date.now() -  30 * 86400_000).toISOString()
  const since90d = new Date(Date.now() -  90 * 86400_000).toISOString()

  const [contractsRes, articlesRes, contracts90dRes] = await Promise.all([
    db.from('contract_events')
      .select('id, fecha, operadora, proveedor, categoria, tipo_evento, monto, moneda, proyecto, ubicacion, confianza, titulo_noticia, resumen')
      .gte('fecha', since30d.slice(0, 10))
      .order('fecha', { ascending: false }),
    db.from('articles_v2')
      .select('category, sentiment, relevance_score, operator_slugs, scraped_at')
      .eq('status', 'completed')
      .gte('scraped_at', since30d),
    db.from('contract_events')
      .select('id, fecha, operadora, proveedor, categoria, monto, moneda, tipo_evento, titulo_noticia, resumen')
      .gte('fecha', since90d.slice(0, 10))
      .order('fecha', { ascending: false }),
  ])

  const contracts30d = contractsRes.data ?? []
  const articles30d  = articlesRes.data  ?? []
  const contracts90d = contracts90dRes.data ?? []

  // --- Pressure index inputs ---
  const upstream30d      = articles30d.filter((a: any) => a.category === 'upstream').length
  const highRelevance30d = articles30d.filter((a: any) => a.relevance_score >= 0.6).length
  const investments30d   = contracts30d.filter((a: any) => ['inversion','ampliacion','expansion'].includes(a.tipo_evento)).length
  const operatorsActive  = new Set(articles30d.flatMap((a: any) => a.operator_slugs ?? [])).size

  const pressureIndex = calcPressureIndex({ contracts30d: contracts30d.length, investments30d, upstream30d, operatorsActive, highRelevance30d })

  // --- Top operators (contract weight = 2, article mention = 1) ---
  const opCount: Record<string, number> = {}
  for (const c of contracts30d as any[]) {
    if (c.operadora) opCount[c.operadora] = (opCount[c.operadora] ?? 0) + 2
  }
  for (const a of articles30d as any[]) {
    for (const slug of (a.operator_slugs ?? [])) {
      opCount[slug] = (opCount[slug] ?? 0) + 1
    }
  }
  const topOperators = Object.entries(opCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name, count }))

  // --- Top suppliers ---
  const supplierCount: Record<string, number> = {}
  for (const c of contracts90d as any[]) {
    if (c.proveedor) supplierCount[c.proveedor] = (supplierCount[c.proveedor] ?? 0) + 1
  }
  const topSuppliers = Object.entries(supplierCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name, count }))

  // --- Category distribution (90d) ---
  const catCount: Record<string, number> = {}
  for (const c of contracts90d as any[]) {
    if (c.categoria) catCount[c.categoria] = (catCount[c.categoria] ?? 0) + 1
  }
  const categoryDistribution = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({ cat, count }))

  // --- Total announced investment (USD only) ---
  const totalInvestmentUSD = contracts90d.reduce((sum: number, c: any) => {
    return c.monto && c.moneda === 'USD' ? sum + c.monto : sum
  }, 0)

  // --- Cost pressure signals ---
  const catCounts30d: Record<string, number> = {}
  for (const c of contracts30d as any[]) {
    if (c.categoria) catCounts30d[c.categoria] = (catCounts30d[c.categoria] ?? 0) + 1
  }

  const pressureSignals: { category: string; signal: string; severity: 'high' | 'medium' | 'low' }[] = []

  const watchCategories = ['perforacion', 'fractura', 'gasoductos', 'epc', 'logistica', 'construccion']
  for (const cat of watchCategories) {
    const n = catCounts30d[cat] ?? 0
    if (n >= 2) {
      pressureSignals.push({
        category: cat,
        signal:   `Probable aumento de costos en ${cat} — ${n} contratos detectados en 30 días`,
        severity: n >= 5 ? 'high' : n >= 3 ? 'medium' : 'low',
      })
    }
  }

  if (contracts30d.length >= 8 && pressureSignals.length === 0) {
    pressureSignals.push({
      category: 'general',
      signal:   `Mercado activo: ${contracts30d.length} eventos de contratación en 30 días`,
      severity: contracts30d.length >= 15 ? 'high' : 'medium',
    })
  }

  // --- Sentiment distribution ---
  const sentimentCount: Record<string, number> = {}
  for (const a of articles30d as any[]) {
    if (a.sentiment) sentimentCount[a.sentiment] = (sentimentCount[a.sentiment] ?? 0) + 1
  }

  return NextResponse.json({
    pressureIndex,
    stats: {
      contracts30d:      contracts30d.length,
      contracts90d:      contracts90d.length,
      investments30d,
      totalInvestmentUSD,
      operatorsActive,
      upstream30d,
      highRelevance30d,
      articles30d:       articles30d.length,
    },
    topOperators,
    topSuppliers,
    categoryDistribution,
    pressureSignals,
    recentEvents:   contracts30d.slice(0, 12),
    sentimentDist:  sentimentCount,
  })
}
