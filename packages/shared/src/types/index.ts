// ─── Source ───────────────────────────────────────────────────────────────────

export type SourceType = 'rss' | 'html' | 'playwright'

export interface Source {
  id: string
  name: string
  url: string
  type: SourceType
  category: OGCategory
  selector: string | null
  scrape_interval_minutes: number
  is_active: boolean
  last_scraped_at: string | null
  last_error: string | null
  error_count: number
  created_at: string
  updated_at: string
}

// ─── Article ──────────────────────────────────────────────────────────────────

export type ArticleStatus = 'pending' | 'processing' | 'done' | 'failed'
export type Sentiment = 'positive' | 'negative' | 'neutral'

export interface Article {
  id: string
  source_id: string
  url: string
  url_hash: string
  title: string | null
  content: string | null
  summary: string | null
  published_at: string | null
  scraped_at: string
  processed_at: string | null
  status: ArticleStatus
  category: OGCategory | null
  subcategory: string | null
  sentiment: Sentiment | null
  relevance_score: number | null
  supply_chain_impact: string | null
  keywords: string[]
  error_message: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface ArticleWithSource extends Article {
  source: Pick<Source, 'name' | 'url' | 'type'>
}

// ─── Entity ───────────────────────────────────────────────────────────────────

export type EntityType = 'company' | 'person' | 'location' | 'project' | 'regulation'

export interface Entity {
  id: string
  name: string
  type: EntityType
  normalized_name: string
  description: string | null
  mention_count: number
  created_at: string
}

export interface ArticleEntity {
  article_id: string
  entity_id: string
  context: string | null
  relevance: number | null
}

export interface ArticleEntityWithEntity extends ArticleEntity {
  entity: Entity
}

// ─── Signal ───────────────────────────────────────────────────────────────────

export type SignalType =
  | 'price_change'
  | 'supply_disruption'
  | 'new_contract'
  | 'regulatory_change'
  | 'company_news'
  | 'infrastructure'
  | 'logistics'
  | 'market'

export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical'
export type SignalStatus = 'active' | 'resolved' | 'dismissed'

export interface Signal {
  id: string
  type: SignalType
  title: string
  description: string | null
  severity: SignalSeverity
  status: SignalStatus
  article_ids: string[]
  entity_ids: string[]
  metadata: Record<string, unknown>
  detected_at: string
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

// ─── Alert ────────────────────────────────────────────────────────────────────

export type AlertChannel = 'email' | 'slack' | 'webhook'
export type AlertEventStatus = 'pending' | 'sent' | 'failed'

export interface AlertConditions {
  keywords?: string[]
  categories?: OGCategory[]
  entity_names?: string[]
  signal_types?: SignalType[]
  min_relevance?: number
}

export interface AlertChannels {
  email?: boolean
  slack?: boolean
  webhook_url?: string | null
}

export interface AlertRule {
  id: string
  user_id: string
  name: string
  description: string | null
  conditions: AlertConditions
  channels: AlertChannels
  is_active: boolean
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
  updated_at: string
}

export interface AlertEvent {
  id: string
  rule_id: string
  article_id: string
  channel: AlertChannel
  status: AlertEventStatus
  error_message: string | null
  triggered_at: string
}

// ─── Brief ────────────────────────────────────────────────────────────────────

export interface BriefTopEntity {
  name: string
  type: EntityType
  count: number
}

export interface BriefKeySignal {
  id: string
  title: string
  severity: SignalSeverity
  type: SignalType
}

export interface ExecutiveBrief {
  id: string
  date: string
  content: string
  content_html: string | null
  model_used: string
  articles_analyzed: number
  top_entities: BriefTopEntity[]
  key_signals: BriefKeySignal[]
  generated_at: string
  generated_by: string | null
}

// ─── O&G Categories ───────────────────────────────────────────────────────────

export type OGCategory =
  | 'upstream'
  | 'downstream'
  | 'midstream'
  | 'supply_chain'
  | 'regulation'
  | 'market'
  | 'company'
  | 'environment'
  | 'politics'
  | 'infrastructure'
  | 'other'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'viewer'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

// ─── Queue Job Payloads ───────────────────────────────────────────────────────

export interface ScrapeJob {
  sourceId: string
  sourceName: string
  sourceUrl: string
  sourceType: SourceType
  selector?: string | null
}

export interface ProcessArticleJob {
  articleId: string
  title: string
  content: string
  url: string
}

export interface DetectSignalsJob {
  articleId: string
  category: OGCategory
  entityIds: string[]
  relevanceScore: number
  keywords: string[]
}

export interface EvaluateAlertsJob {
  articleId: string
  category: OGCategory
  keywords: string[]
  entityNames: string[]
  relevanceScore: number
}

export interface GenerateBriefJob {
  date: string
  force?: boolean
  triggeredBy?: string
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface ApiError {
  error: string
  message?: string
  statusCode: number
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardKPIs {
  articles_today: number
  articles_week: number
  active_signals: number
  sources_active: number
  avg_relevance_score: number
  top_category: OGCategory | null
}

export interface DailyTrend {
  date: string
  count: number
  avg_relevance: number
}

export interface CompanyMention {
  name: string
  count: number
  trend: 'up' | 'down' | 'stable'
}
