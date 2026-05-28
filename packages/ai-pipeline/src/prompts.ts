export const CLASSIFICATION_SYSTEM_PROMPT = `Eres un analista experto en el sector Oil & Gas Argentina, especializado en Vaca Muerta, Supply Chain energético y mercados de hidrocarburos.

Tu tarea es analizar artículos y extraer información estructurada con foco estricto en impacto para el sector O&G.

Criterio clave para relevance_score: solo el impacto DIRECTO en Oil & Gas Argentina eleva el score. Política general, macroeconomía sin vínculo energético, o noticias sociales deben recibir score bajo (< 0.3).

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.`

const PRIORITY_SOURCES = [
  'econojournal.com.ar',
  'vacamuerta.ar',
  'rionegro.com.ar',
  'mase.lmneuquen.com',
  'lmneuquen.com',
  'mckinsey.com',
  'minutoneuquen.com',
  'rystadenergy.com',
]

function isPrioritySource(sourceUrl: string): boolean {
  return PRIORITY_SOURCES.some(domain => sourceUrl.includes(domain))
}

export function buildClassificationPrompt(title: string, content: string, sourceUrl?: string): string {
  const truncatedContent = content.length > 3000
    ? content.slice(0, 3000) + '...'
    : content

  const priorityNote = sourceUrl && isPrioritySource(sourceUrl)
    ? `\nFUENTE PRIORITARIA: Este artículo proviene de ${sourceUrl}, una fuente de referencia clave para el sector O&G Argentina/Vaca Muerta. Considerá que su análisis sectorial es de alta credibilidad. El relevance_score mínimo para cualquier contenido relacionado con O&G debe ser 0.55.\n`
    : ''

  return `Analiza este artículo de noticias del sector O&G Argentina:

TÍTULO: ${title}
${priorityNote}
CONTENIDO: ${truncatedContent}

Responde con este JSON exacto (sin texto adicional):
{
  "category": "upstream|downstream|midstream|supply_chain|regulation|market|company|environment|politics|infrastructure|other",
  "subcategory": "string breve (máx 30 chars)",
  "sentiment": "positive|negative|neutral",
  "relevance_score": 0.0,
  "supply_chain_impact": "string breve descripción del impacto en supply chain (null si no aplica)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "summary": "Resumen de 2-3 oraciones en español.",
  "entities": [
    {
      "name": "Nombre de la entidad",
      "type": "company|person|location|project|regulation",
      "context": "frase donde fue mencionada"
    }
  ]
}

Criterios de relevance_score (0.0 a 1.0):
- 0.0-0.3: Noticia general, impacto mínimo en supply chain O&G
- 0.3-0.6: Impacto moderado en operaciones o mercado
- 0.6-0.8: Impacto significativo en supply chain O&G Argentina
- 0.8-1.0: Impacto crítico (disrupciones, cambios regulatorios mayores, contratos estratégicos)

Incluye máximo 10 entidades y 10 keywords.`
}
