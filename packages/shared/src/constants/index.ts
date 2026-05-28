import type { OGCategory, SignalType } from '../types/index.js'

// ─── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUES = {
  SCRAPE: 'scrape',
  PROCESS_ARTICLE: 'process-article',
  DETECT_SIGNALS: 'detect-signals',
  EVALUATE_ALERTS: 'evaluate-alerts',
  GENERATE_BRIEF: 'generate-brief',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

// ─── O&G Categories ───────────────────────────────────────────────────────────

export const OG_CATEGORIES: Record<OGCategory, string> = {
  upstream: 'Upstream (exploración y producción)',
  downstream: 'Downstream (refinación y comercialización)',
  midstream: 'Midstream (transporte y almacenamiento)',
  supply_chain: 'Cadena de suministro',
  regulation: 'Regulación y normativa',
  market: 'Mercado y precios',
  company: 'Noticias corporativas',
  environment: 'Medio ambiente y sustentabilidad',
  politics: 'Política energética',
  infrastructure: 'Infraestructura',
  other: 'Otros',
}

// ─── Signal Types ─────────────────────────────────────────────────────────────

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  price_change: 'Cambio de precios',
  supply_disruption: 'Disrupción de suministro',
  new_contract: 'Nuevo contrato o licitación',
  regulatory_change: 'Cambio regulatorio',
  company_news: 'Noticia corporativa relevante',
  infrastructure: 'Infraestructura',
  logistics: 'Logística y transporte',
  market: 'Señal de mercado',
}

// ─── Signal Keywords ──────────────────────────────────────────────────────────

export const SIGNAL_KEYWORDS: Record<SignalType, string[]> = {
  price_change: ['precio', 'cotización', 'tarifa', 'aumento', 'baja', 'incremento', 'variación', '%', 'WTI', 'Brent', 'barril'],
  supply_disruption: ['escasez', 'corte', 'interrupción', 'paralización', 'desabastecimiento', 'huelga', 'paro', 'cierre', 'suspensión'],
  new_contract: ['licitación', 'contrato', 'adjudicación', 'concesión', 'acuerdo', 'firma', 'convenio', 'alianza', 'joint venture'],
  regulatory_change: ['resolución', 'decreto', 'ley', 'normativa', 'reglamento', 'autorización', 'habilitación', 'ENARGAS', 'ENARSA', 'Secretaría de Energía'],
  company_news: ['fusión', 'adquisición', 'inversión', 'expansión', 'inauguración', 'producción récord', 'CEO', 'directorio', 'resultado'],
  infrastructure: ['gasoducto', 'oleoducto', 'planta', 'refinería', 'terminal', 'construcción', 'obra', 'expansión', 'compresor'],
  logistics: ['transporte', 'camión', 'buque', 'cargamento', 'flete', 'logística', 'distribución', 'almacenamiento'],
  market: ['demanda', 'oferta', 'mercado', 'exportación', 'importación', 'producción', 'reservas', 'inventario'],
}

// ─── Relevance Thresholds ─────────────────────────────────────────────────────

export const RELEVANCE_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.5,
  HIGH: 0.7,
  CRITICAL: 0.9,
} as const

// ─── Default Scrape Intervals (minutes) ───────────────────────────────────────

export const DEFAULT_SCRAPE_INTERVALS = {
  rss: 30,
  html: 60,
  playwright: 120,
} as const

// ─── Models ───────────────────────────────────────────────────────────────────

export const AI_MODELS = {
  CLASSIFY: 'llama-3.1-8b-instant',   // Groq — fast, free
  BRIEF: 'llama-3.3-70b-versatile',   // Groq — capable, free
} as const

// ─── Article retry limits ─────────────────────────────────────────────────────

export const MAX_ARTICLE_RETRIES = 3
export const MAX_SCRAPE_RETRIES = 5

// ─── Brief generation schedule ────────────────────────────────────────────────

export const BRIEF_GENERATION_HOUR = 7 // 7:00 AM Argentina time
export const BRIEF_MIN_ARTICLES = 5
