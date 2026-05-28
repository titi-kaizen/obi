import Groq from 'groq-sdk'
import { AI_MODELS } from '@ogasci/shared'
import type { OGCategory, Sentiment, EntityType } from '@ogasci/shared'
import { CLASSIFICATION_SYSTEM_PROMPT, buildClassificationPrompt } from './prompts'

let _client: Groq | null = null
function getClient(): Groq {
  if (!_client) _client = new Groq({ apiKey: process.env['GROQ_API_KEY'] })
  return _client
}

export interface ClassificationResult {
  category: OGCategory
  subcategory: string
  sentiment: Sentiment
  relevance_score: number
  supply_chain_impact: string | null
  keywords: string[]
  summary: string
  entities: Array<{
    name: string
    type: EntityType
    context: string
  }>
}

export async function classifyArticle(
  title: string,
  content: string,
  sourceUrl?: string
): Promise<ClassificationResult> {
  const completion = await getClient().chat.completions.create({
    model: AI_MODELS.CLASSIFY,
    max_tokens: 1024,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: buildClassificationPrompt(title, content, sourceUrl) },
    ],
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  if (!raw) throw new Error('No response from Groq')

  let result: ClassificationResult
  try {
    result = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse Groq response as JSON: ${raw.slice(0, 200)}`)
  }

  // Validate and sanitize
  return {
    category:            validateCategory(result.category),
    subcategory:         String(result.subcategory ?? '').slice(0, 60),
    sentiment:           validateSentiment(result.sentiment),
    relevance_score:     clamp(Number(result.relevance_score ?? 0), 0, 1),
    supply_chain_impact: result.supply_chain_impact ?? null,
    keywords:            (result.keywords ?? []).slice(0, 10).map(String),
    summary:             String(result.summary ?? ''),
    entities:            (result.entities ?? []).slice(0, 10).map(sanitizeEntity),
  }
}

function validateCategory(raw: unknown): OGCategory {
  const valid: OGCategory[] = [
    'upstream', 'downstream', 'midstream', 'supply_chain',
    'regulation', 'market', 'company', 'environment', 'politics', 'infrastructure', 'other',
  ]
  return valid.includes(raw as OGCategory) ? (raw as OGCategory) : 'other'
}

function validateSentiment(raw: unknown): Sentiment {
  const valid: Sentiment[] = ['positive', 'negative', 'neutral']
  return valid.includes(raw as Sentiment) ? (raw as Sentiment) : 'neutral'
}

function validateEntityType(raw: unknown): EntityType {
  const valid: EntityType[] = ['company', 'person', 'location', 'project', 'regulation']
  return valid.includes(raw as EntityType) ? (raw as EntityType) : 'company'
}

function sanitizeEntity(e: Record<string, unknown>) {
  return {
    name:    String(e['name'] ?? '').slice(0, 200),
    type:    validateEntityType(e['type']),
    context: String(e['context'] ?? '').slice(0, 500),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
