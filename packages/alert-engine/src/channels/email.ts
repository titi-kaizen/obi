import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env['SMTP_HOST'] ?? 'smtp.gmail.com',
  port:   parseInt(process.env['SMTP_PORT'] ?? '587', 10),
  secure: process.env['SMTP_SECURE'] === 'true',
  auth: {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
  },
})

export interface EmailAlertPayload {
  to: string
  articleTitle: string
  articleUrl: string
  articleSummary: string
  category: string
  relevanceScore: number
  ruleName: string
}

export async function sendEmailAlert(payload: EmailAlertPayload): Promise<void> {
  const { to, articleTitle, articleUrl, articleSummary, category, relevanceScore, ruleName } = payload

  const relevancePct = Math.round(relevanceScore * 100)

  await transporter.sendMail({
    from:    `"OGASCI Alerts" <${process.env['SMTP_FROM'] ?? process.env['SMTP_USER']}>`,
    to,
    subject: `[OGASCI] Alerta: ${articleTitle.slice(0, 80)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Alerta OGASCI — ${ruleName}</h2>
        <div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 16px; margin: 16px 0;">
          <h3 style="margin: 0 0 8px;">${articleTitle}</h3>
          <p style="color: #666; font-size: 14px; margin: 0;">
            Categoría: <strong>${category}</strong> |
            Relevancia supply chain: <strong>${relevancePct}%</strong>
          </p>
        </div>
        <p style="color: #444;">${articleSummary}</p>
        <a href="${articleUrl}" style="
          display: inline-block;
          background: #007bff;
          color: white;
          padding: 10px 20px;
          border-radius: 4px;
          text-decoration: none;
          margin-top: 8px;
        ">Ver artículo completo</a>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <p style="color: #999; font-size: 12px;">
          Recibiste esta alerta porque tienes configurada la regla "${ruleName}" en OGASCI.
        </p>
      </div>
    `,
  })
}
