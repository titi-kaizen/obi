import Groq from 'groq-sdk'

export const CONTRACT_CATEGORIES = [
  'gasoductos', 'oleoductos', 'ductos', 'obras_civiles', 'epc',
  'electricidad', 'campamentos', 'perforacion', 'fractura',
  'logistica', 'transporte', 'arena', 'agua', 'mantenimiento',
  'facilities', 'ingenieria', 'otro',
] as const

export type ContractCategory = typeof CONTRACT_CATEGORIES[number]

const CONTRACT_KEYWORDS = [
  'adjudic', 'licit', 'contrat', 'amplia', 'invertir', 'invertirá', 'invertira',
  'desarrollar', 'ejecutar', 'construir', 'expandir', 'inversión', 'inversion',
  'millones', 'licitación', 'licitacion', 'adjudicación', 'adjudicacion',
  'capex', 'obra', 'proyecto', 'contrato', 'convenio', 'acuerdo', 'alianza',
]

export function hasContractSignals(text: string): boolean {
  const lower = text.toLowerCase()
  return CONTRACT_KEYWORDS.some(kw => lower.includes(kw))
}

const SYSTEM = `Eres un experto en contratos, licitaciones e inversiones del sector Oil & Gas Argentina.
Analizás artículos de noticias y extraés información estructurada sobre contratos, inversiones y proyectos.
Respondés ÚNICAMENTE con JSON válido, sin texto adicional.`

const TEMPLATE = `Analizá este artículo del sector O&G Argentina y extraé información contractual.

TÍTULO: {title}
CONTENIDO: {content}

Respondé con este JSON exacto:
{
  "es_contrato": true/false,
  "tipo_evento": "contrato|licitacion|adjudicacion|inversion|ampliacion|expansion|otro",
  "operadora": "nombre completo o null",
  "proveedor": "nombre completo o null",
  "monto": número_sin_texto_o_null,
  "moneda": "USD|ARS|null",
  "proyecto": "nombre del proyecto o null",
  "ubicacion": "ubicación geográfica o null",
  "capacidad": "capacidad técnica mencionada o null",
  "plazo": "plazo de ejecución o null",
  "categoria": "gasoductos|oleoductos|ductos|obras_civiles|epc|electricidad|campamentos|perforacion|fractura|logistica|transporte|arena|agua|mantenimiento|facilities|ingenieria|otro",
  "confianza": 0.0_a_1.0,
  "resumen_evento": "Una oración describiendo el evento"
}

REGLAS:
- es_contrato = true SOLO si hay un contrato, licitación, adjudicación, inversión o proyecto concreto.
- monto: solo el número, sin texto (ej: 50000000 para "50 millones USD"). null si no se menciona.
- confianza: 1.0 = datos explícitos, 0.6 = inferidos, 0.3 = vagos.`

export interface ContractExtraction {
  tipo_evento: string
  operadora: string | null
  proveedor: string | null
  monto: number | null
  moneda: string | null
  proyecto: string | null
  ubicacion: string | null
  capacidad: string | null
  plazo: string | null
  categoria: string
  confianza: number
  resumen_evento: string
}

export async function extractContractFromArticle(
  groq: Groq,
  article: { title: string; content: string }
): Promise<ContractExtraction | null> {
  const content = (article.content || article.title || '').slice(0, 3000)
  const prompt = TEMPLATE
    .replace('{title}', article.title || '(sin título)')
    .replace('{content}', content)

  const resp = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user',   content: prompt },
    ],
    max_tokens:      600,
    temperature:     0.05,
    response_format: { type: 'json_object' },
  })

  let data: Record<string, any> = {}
  try {
    const raw = resp.choices[0]?.message?.content ?? '{}'
    const m = raw.match(/\{[\s\S]*\}/)
    data = m ? JSON.parse(m[0]) : {}
  } catch { return null }

  if (!data.es_contrato) return null

  return {
    tipo_evento:    String(data.tipo_evento || 'otro'),
    operadora:      data.operadora ? String(data.operadora).slice(0, 100) : null,
    proveedor:      data.proveedor ? String(data.proveedor).slice(0, 100) : null,
    monto:          data.monto ? (parseFloat(String(data.monto)) || null) : null,
    moneda:         ['USD', 'ARS'].includes(String(data.moneda)) ? String(data.moneda) : null,
    proyecto:       data.proyecto ? String(data.proyecto).slice(0, 200) : null,
    ubicacion:      data.ubicacion ? String(data.ubicacion).slice(0, 100) : null,
    capacidad:      data.capacidad ? String(data.capacidad).slice(0, 200) : null,
    plazo:          data.plazo ? String(data.plazo).slice(0, 100) : null,
    categoria:      (CONTRACT_CATEGORIES as readonly string[]).includes(data.categoria) ? data.categoria : 'otro',
    confianza:      Math.max(0, Math.min(1, parseFloat(String(data.confianza)) || 0.5)),
    resumen_evento: String(data.resumen_evento || '').slice(0, 500),
  }
}
