import { supabase } from './supabase'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function scanImageWithGemini(file: File, onProgress: (message: string) => void) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error('O Gemini aceita imagens JPG, PNG ou WebP. Use o OCR local para este arquivo.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('A imagem deve ter no máximo 8 MB para leitura com Gemini.')
  if (!supabase) throw new Error('A autenticação não está configurada. Use o OCR local.')

  onProgress('Preparando imagem para o Gemini...')
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) throw new Error('Entre na sua conta para usar o Gemini.')

  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível abrir a imagem.'))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Imagem inválida.'))
    reader.readAsDataURL(file)
  })
  const image = imageDataUrl.split(',')[1]
  if (!image) throw new Error('Imagem inválida.')

  onProgress('Enviando imagem ao Gemini para leitura...')
  const response = await fetch('/api/documents/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ image, mimeType: file.type }),
  })
  const result = await response.json() as { text?: string; message?: string }
  if (!response.ok || !result.text) throw new Error(result.message || 'Falha na leitura com Gemini.')
  return result.text
}