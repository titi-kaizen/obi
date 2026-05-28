import axios from 'axios'

export interface SlackAlertPayload {
  webhookUrl: string
  articleTitle: string
  articleUrl: string
  articleSummary: string
  category: string
  relevanceScore: number
  ruleName: string
}

export async function sendSlackAlert(payload: SlackAlertPayload): Promise<void> {
  const { webhookUrl, articleTitle, articleUrl, articleSummary, category, relevanceScore, ruleName } = payload

  const relevancePct = Math.round(relevanceScore * 100)
  const severityEmoji = relevanceScore >= 0.8 ? ':rotating_light:' : relevanceScore >= 0.6 ? ':warning:' : ':information_source:'

  const body = {
    text: `${severityEmoji} *Alerta OGASCI* — ${ruleName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${severityEmoji} Alerta OGASCI` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${articleUrl}|${articleTitle}>*\n${articleSummary}`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Regla: *${ruleName}*` },
          { type: 'mrkdwn', text: `Categoría: *${category}*` },
          { type: 'mrkdwn', text: `Relevancia SC: *${relevancePct}%*` },
        ],
      },
    ],
  }

  await axios.post(webhookUrl, body, { timeout: 10000 })
}
