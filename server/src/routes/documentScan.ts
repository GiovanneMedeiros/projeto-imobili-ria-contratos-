import { createClient } from '@supabase/supabase-js'
import express, { Router, type Request, type Response } from 'express'
import { env } from '../config/env.js'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const REQUEST_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 10
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const recentRequests = new Map<string, number[]>()

export const documentScanRouter = Router()

documentScanRouter.use(express.json({ limit: '12mb' }))

documentScanRouter.post('/scan', async (request: Request, response: Response) => {
  if (!env.GEMINI_API_KEY) {
    response.status(503).json({ message: 'A leitura Gemini não está configurada no servidor.' })
    return
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    response.status(503).json({ message: 'A autenticação do serviço não está configurada no servidor.' })
    return
  }

  const authorization = request.header('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) {
    response.status(401).json({ message: 'Entre novamente para usar a leitura Gemini.' })
    return
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    response.status(401).json({ message: 'Sessão inválida. Entre novamente e tente outra vez.' })
    return
  }

  const now = Date.now()
  const recent = (recentRequests.get(data.user.id) ?? []).filter((timestamp) => now - timestamp < REQUEST_WINDOW_MS)
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    response.status(429).json({ message: 'Limite de 10 imagens por minuto atingido. Aguarde um pouco e tente novamente.' })
    return
  }
  recent.push(now)
  recentRequests.set(data.user.id, recent)

  const body = request.body as { image?: unknown; mimeType?: unknown } | null
  if (!body || typeof body.image !== 'string' || typeof body.mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(body.mimeType)) {
    response.status(400).json({ message: 'Formato inválido. Envie uma imagem JPG, PNG ou WebP.' })
    return
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
    response.status(400).json({ message: 'A imagem enviada não é válida.' })
    return
  }

  const image = Buffer.from(body.image, 'base64')
  if (!image.length || image.length > MAX_IMAGE_BYTES) {
    response.status(413).json({ message: 'A imagem deve ter no máximo 8 MB.' })
    return
  }

  try {
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcreva fielmente todo o texto legível desta imagem de documento brasileiro. Preserve nomes, números, datas e acentos exatamente como aparecem; mantenha linhas separadas. Não resuma, não corrija, não deduza e não invente informações. Se não houver texto legível, responda apenas: SEM TEXTO LEGIVEL.' },
            { inline_data: { mime_type: body.mimeType, data: image.toString('base64') } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    })
    const result = await geminiResponse.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      error?: { status?: string }
    }
    if (!geminiResponse.ok) {
      console.warn(`Gemini image scan rejected: HTTP ${geminiResponse.status}${result.error?.status ? ` (${result.error.status})` : ''}`)
      const message = geminiResponse.status === 429
        ? 'Limite gratuito do Gemini atingido. Aguarde e tente novamente ou use o OCR local.'
        : geminiResponse.status >= 500
          ? 'O Gemini está temporariamente indisponível. Tente novamente ou use o OCR local.'
          : 'O Gemini rejeitou esta imagem. Confira o formato e tente novamente ou use o OCR local.'
      response.status(geminiResponse.status === 429 ? 429 : 502).json({ message })
      return
    }
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim()
    if (!text) {
      response.status(502).json({ message: 'O Gemini não encontrou texto legível. Tente uma imagem mais nítida ou use o OCR local.' })
      return
    }
    response.json({ text })
  } catch {
    response.status(502).json({ message: 'Não foi possível conectar ao Gemini. Tente novamente ou use o OCR local.' })
  }
})

documentScanRouter.use((error: unknown, _request: Request, response: Response, next: (error?: unknown) => void) => {
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    response.status(413).json({ message: 'A imagem deve ter no máximo 8 MB.' })
    return
  }
  next(error)
})