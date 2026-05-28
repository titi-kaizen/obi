import axios from 'axios'

export interface WebhookAlertPayload {
  url: string
  articleId: string
  articleTitle: string
  articleUrl: string
  articleSummary: string
  category: string
  relevanceScore: number
  ruleName: string
  ruleId: string
  triggeredAt: string
}

export async function sendWebhookAlert(payload: WebhookAlertPayload): Promise<void> {
  await axios.post(payload.url, {
    event:    'ogasci.alert.triggered',
    version:  '1.0',
    data: {
      rule:    { id: payload.ruleId, name: payload.ruleName },
      article: {
        id:              payload.articleId,
        title:           payload.articleTitle,
        url:             payload.articleUrl,
        summary:         payload.articleSummary,
        category:        payload.category,
        relevance_score: payload.relevanceScore,
      },
      triggered_at: payload.triggeredAt,
    },
  }, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json', 'X-OGASCI-Event': 'alert' },
  })
}
