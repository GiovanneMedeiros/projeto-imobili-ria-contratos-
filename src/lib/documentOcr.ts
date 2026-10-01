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
    return { text: data.text, confidence: data.confidence }
  }

  async function recognizeWithFallback(canvas: HTMLCanvasElement, onProgress: (message: string) => void) {
    const first = await recognize(prepareCanvas(canvas))
    if (first.confidence >= 62) return first.text
    onProgress('Leitura fraca; tentando melhorar o contraste da imagem...')
    const retry = await recognize(prepareThresholdCanvas(canvas))
    return retry.confidence > first.confidence ? retry.text : first.text
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
          parts.push(await recognizeWithFallback(canvas, onProgress))
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
      return { text: await recognizeWithFallback(canvas, onProgress), usedOcr: true }
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

function prepareThresholdCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context) return source
  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  const histogram = new Uint32Array(256)
  const grayscale = new Uint8Array(pixels.length / 4)
  for (let pixel = 0, offset = 0; offset < pixels.length; pixel += 1, offset += 4) {
    const value = Math.round(pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114)
    grayscale[pixel] = value
    histogram[value] += 1
  }

  const total = grayscale.length
  let sum = 0
  for (let value = 0; value < histogram.length; value += 1) sum += value * histogram[value]
  let backgroundWeight = 0
  let backgroundSum = 0
  let threshold = 127
  let maxVariance = 0
  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value]
    if (!backgroundWeight) continue
    const foregroundWeight = total - backgroundWeight
    if (!foregroundWeight) break
    backgroundSum += value * histogram[value]
    const meanBackground = backgroundSum / backgroundWeight
    const meanForeground = (sum - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2
    if (variance > maxVariance) { maxVariance = variance; threshold = value }
  }

  for (let pixel = 0, offset = 0; offset < pixels.length; pixel += 1, offset += 4) {
    const value = grayscale[pixel] > threshold ? 255 : 0
    pixels[offset] = value
    pixels[offset + 1] = value
    pixels[offset + 2] = value
  }
  context.putImageData(image, 0, 0)
  return canvas
}
