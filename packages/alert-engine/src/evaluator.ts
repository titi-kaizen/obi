import type { AlertRule, OGCategory } from '@ogasci/shared'

export interface AlertMatch {
  ruleId: string
  userId: string
  channels: AlertRule['channels']
}

/**
 * Evaluates all active alert rules against article metadata.
 * Returns the list of rules that match.
 */
export function evaluateRules(
  rules: AlertRule[],
  params: {
    category: OGCategory
    keywords: string[]
    entityNames: string[]
    relevanceScore: number
  }
): AlertMatch[] {
  const { category, keywords, entityNames, relevanceScore } = params
  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()))
  const entitySet = new Set(entityNames.map((e) => e.toLowerCase()))

  const matches: AlertMatch[] = []

  for (const rule of rules) {
    if (!rule.is_active) continue

    const { conditions } = rule

    // Relevance threshold
    if (conditions.min_relevance != null && relevanceScore < conditions.min_relevance) {
      continue
    }

    // At least one condition must match
    let matched = false

    // Category match
    if (conditions.categories && conditions.categories.length > 0) {
      if (conditions.categories.includes(category)) matched = true
    }

    // Keyword match
    if (!matched && conditions.keywords && conditions.keywords.length > 0) {
      const hasKeyword = conditions.keywords.some((kw) =>
        keywordSet.has(kw.toLowerCase())
      )
      if (hasKeyword) matched = true
    }

    // Entity match
    if (!matched && conditions.entity_names && conditions.entity_names.length > 0) {
      const hasEntity = conditions.entity_names.some((name) =>
        entitySet.has(name.toLowerCase())
      )
      if (hasEntity) matched = true
    }

    if (matched) {
      matches.push({
        ruleId:   rule.id,
        userId:   rule.user_id,
        channels: rule.channels,
      })
    }
  }

  return matches
}
