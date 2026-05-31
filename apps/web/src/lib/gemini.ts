// Thin wrapper around the Gemini REST API — no SDK needed.
// Model: gemini-2.0-flash-lite (free tier, 1500 req/day, 1M tokens/min)

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL = 'gemini-2.0-flash-lite'

export interface GeminiMessage {
  role: 'user' | 'model'
  text: string
}

export async function geminiJSON<T = Record<string, unknown>>(
  prompt: string,
  apiKey: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  const url = `${BASE}/${MODEL}:generateContent?key=${apiKey}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature:      opts?.temperature  ?? 0.3,
      maxOutputTokens:  opts?.maxTokens    ?? 2048,
    },
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'

  try {
    const m = text.match(/\{[\s\S]*\}/)
    return (m ? JSON.parse(m[0]) : {}) as T
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`)
  }
}

export async function geminiText(
  prompt: string,
  apiKey: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const url = `${BASE}/${MODEL}:generateContent?key=${apiKey}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:     opts?.temperature ?? 0.3,
      maxOutputTokens: opts?.maxTokens   ?? 4096,
    },
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}
