import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from 'pino'
import { QUEUES } from '@ogasci/shared'
import type { EvaluateAlertsJob, AlertRule } from '@ogasci/shared'
import { evaluateRules } from './evaluator'
import { sendEmailAlert } from './channels/email'
import { sendSlackAlert } from './channels/slack'
import { sendWebhookAlert } from './channels/webhook'

export function createAlertEngineWorker(logger: Logger) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  const supabase = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  )

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const worker = new Worker<EvaluateAlertsJob>(
    QUEUES.EVALUATE_ALERTS,
    async (job: Job<EvaluateAlertsJob>) => {
      const { articleId, category, keywords, entityNames, relevanceScore } = job.data
      const log = logger.child({ articleId, job: job.id })

      // Fetch all active alert rules
      const { data: rules, error: rulesError } = await supabase
        .from('alert_rules')
        .select('*')
        .eq('is_active', true)

      if (rulesError) throw new Error(rulesError.message)
      if (!rules || rules.length === 0) return

      const matches = evaluateRules(rules as AlertRule[], {
        category,
        keywords,
        entityNames,
        relevanceScore,
      })

      if (matches.length === 0) {
        log.debug('No alert rules matched')
        return
      }

      log.info({ count: matches.length }, 'Alert rules matched')

      // Fetch article details for notification content
      const { data: article } = await supabase
        .from('articles')
        .select('title, url, summary')
        .eq('id', articleId)
        .single()

      if (!article) return

      const triggeredAt = new Date().toISOString()
      let notificationsSent = 0

      for (const match of matches) {
        const rule = (rules as AlertRule[]).find((r) => r.id === match.ruleId)
        if (!rule) continue

        const basePayload = {
          articleId,
          articleTitle:   article.title ?? 'Sin título',
          articleUrl:     article.url,
          articleSummary: article.summary ?? '',
          category,
          relevanceScore,
          ruleName:       rule.name,
          ruleId:         rule.id,
          triggeredAt,
        }

        // Get user email if email channel is enabled
        if (match.channels.email) {
          try {
            const { data: user } = await supabase.auth.admin.getUserById(match.userId)
            if (user.user?.email) {
              await sendEmailAlert({ ...basePayload, to: user.user.email })
              await logAlertEvent(supabase, match.ruleId, articleId, 'email', 'sent')
              notificationsSent++
            }
          } catch (err) {
            log.error({ err, ruleId: match.ruleId }, 'Email alert failed')
            await logAlertEvent(supabase, match.ruleId, articleId, 'email', 'failed',
              err instanceof Error ? err.message : String(err))
          }
        }

        // Slack
        const slackWebhook = process.env['SLACK_ALERTS_WEBHOOK']
        if (match.channels.slack && slackWebhook) {
          try {
            await sendSlackAlert({ ...basePayload, webhookUrl: slackWebhook })
            await logAlertEvent(supabase, match.ruleId, articleId, 'slack', 'sent')
            notificationsSent++
          } catch (err) {
            log.error({ err, ruleId: match.ruleId }, 'Slack alert failed')
            await logAlertEvent(supabase, match.ruleId, articleId, 'slack', 'failed',
              err instanceof Error ? err.message : String(err))
          }
        }

        // Webhook
        if (match.channels.webhook_url) {
          try {
            await sendWebhookAlert({ ...basePayload, url: match.channels.webhook_url })
            await logAlertEvent(supabase, match.ruleId, articleId, 'webhook', 'sent')
            notificationsSent++
          } catch (err) {
            log.error({ err, ruleId: match.ruleId }, 'Webhook alert failed')
            await logAlertEvent(supabase, match.ruleId, articleId, 'webhook', 'failed',
              err instanceof Error ? err.message : String(err))
          }
        }

        // Update rule trigger stats
        await supabase.from('alert_rules').update({
          last_triggered_at: triggeredAt,
          trigger_count: rule.trigger_count + 1,
        }).eq('id', match.ruleId)
      }

      return { matchedRules: matches.length, notificationsSent }
    },
    {
      connection,
      concurrency: 5,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Alert engine job failed')
  })

  return worker
}

async function logAlertEvent(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  ruleId: string,
  articleId: string,
  channel: string,
  status: string,
  errorMessage?: string
) {
  await supabase.from('alert_events').insert({
    rule_id:       ruleId,
    article_id:    articleId,
    channel,
    status,
    error_message: errorMessage ?? null,
  })
}
