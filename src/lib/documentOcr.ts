import { extractPdfText, getPdfPageCount, renderPdfPageToCanvas } from './pdf'

// OCR gratuito executado no navegador (Tesseract.js). Os documentos não saem do computador do usuário.
const MAX_PDF_PAGES = 8
const MAX_IMAGE_SIDE = 2400

type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>

export interface DocumentReader {
  read: (file: File, onProgress: (message: string) => void) => Promise<{ text: string; usedOcr: boolean }>
  close: () => Promise<void>
}

export function createDocumentReader(): DocumentReader {
  let worker: OcrWorker | null = null
  let progressHandler: (message: string) => void = () => undefined

  async function getWorker() {
    if (worker) return worker
    progressHandler('Carregando leitor de texto (somente na primeira vez)...')
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('por', 1, {
      logger: (event: { status: string; progress: number }) => {
        if (event.status === 'recognizing text') progressHandler(`Reconhecendo texto... ${Math.round(event.progress * 100)}%`)
      },
    })
    return worker
  }

  async function recognize(canvas: HTMLCanvasElement) {
    const ocr = await getWorker()
    const { data } = await ocr.recognize(canvas)
    return data.text
  }

  return {
    async read(file, onProgress) {
      progressHandler = onProgress
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        onProgress('Lendo texto do PDF...')
        const digitalText = await extractPdfText(file).catch(() => '')
        if (digitalText.replace(/\s/g, '').length > 80) return { text: digitalText, usedOcr: false }
        const pages = Math.min(await getPdfPageCount(file), MAX_PDF_PAGES)
        const parts: string[] = []
        for (let page = 1; page <= pages; page += 1) {
          onProgress(`PDF escaneado: página ${page} de ${pages}...`)
          const canvas = document.createElement('canvas')
          await renderPdfPageToCanvas(file, canvas, page, 2.2)
          parts.push(await recognize(prepareCanvas(canvas)))
        }
        return { text: parts.join('\n\n'), usedOcr: true }
      }
      if (!file.type.startsWith('image/')) throw new Error('Formato não suportado. Envie uma imagem (JPG, PNG) ou PDF.')
      onProgress('Preparando imagem...')
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * ratio)
      canvas.height = Math.round(bitmap.height * ratio)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      return { text: await recognize(prepareCanvas(canvas)), usedOcr: true }
    },
    async close() {
      await worker?.terminate()
      worker = null
    },
  }
}

// Tons de cinza e mais contraste melhoram a leitura de fotos de documentos.
function prepareCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) return source
  context.filter = 'grayscale(1) contrast(1.35)'
  context.drawImage(source, 0, 0)
  return canvas
}
