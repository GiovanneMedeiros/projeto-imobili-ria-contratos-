import * as pdfjsLib from 'pdfjs-dist'
import type { PDFFont, StandardFonts as StandardPdfFonts } from 'pdf-lib'
import type { ContractTemplateField } from '../types/domain'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export function normalizeImportedPdfText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/([A-Za-z])\s*-\s*\n\s*([a-z])/g, '$1$2')
    .replace(/\n\s{2,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function getPdfPageCount(file: File) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  return pdf.numPages
}

export async function renderPdfPageToCanvas(file: File, canvas: HTMLCanvasElement, pageNumber = 1, scale = 1.3) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })

  canvas.width = viewport.width
  canvas.height = viewport.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível renderizar o PDF.')

  await page.render({ canvas, canvasContext: context, viewport }).promise
}

export async function fillPdfFields(source: Uint8Array, fields: ContractTemplateField[], values: Record<string, string>) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const pdf = await PDFDocument.load(source.slice())
  const embeddedFonts = new Map<string, PDFFont>()

  for (const field of fields) {
    const value = values[field.key]?.trim()
    if (!value) throw new Error(`Preencha o campo ${field.label} antes de gerar o PDF.`)
    const page = pdf.getPage(field.page - 1)
    if (!page) throw new Error(`A posição do campo ${field.label} aponta para uma página inexistente.`)
    const fontName: keyof typeof StandardPdfFonts = 'TimesRoman'
    let font = embeddedFonts.get(fontName)
    if (!font) {
      font = await pdf.embedFont(StandardFonts[fontName])
      embeddedFonts.set(fontName, font)
    }
    const boxWidth = page.getWidth() * field.width / 100
    const fontSize = Math.max(5, Math.min(12, (boxWidth - 4) / font.widthOfTextAtSize(value, 1)))
    const x = page.getWidth() * field.x / 100
    const y = page.getHeight() * (1 - field.y / 100) - fontSize * 1.15
    page.drawText(value, { x, y, size: fontSize, font, maxWidth: boxWidth })
  }

  return pdf.save()
}

export async function extractPdfText(file: File): Promise<string> {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selecione um arquivo PDF válido.')
  }

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let text = ''

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index)
    const content = await page.getTextContent()
    const lines = new Map<number, Array<{ x: number, text: string }>>()

    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue
      const transform = (item as { transform?: number[] }).transform ?? [1, 0, 0, 1, 0, 0]
      const x = Number(transform[4].toFixed(2))
      const y = Number(transform[5].toFixed(2))
      const bucket = Math.round(y / 3) * 3
      const current = lines.get(bucket) ?? []
      current.push({ x, text: item.str })
      lines.set(bucket, current)
    }

    const pageText = [...lines.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([, segments]) => segments
        .sort((left, right) => left.x - right.x)
        .map((segment) => segment.text)
        .join(' '))
      .join('\n')

    text += `${pageText}\n\n`
  }

  return normalizeImportedPdfText(text)
}

export async function fillPdfPlaceholders(source: Uint8Array, values: Record<string, string>) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await pdfjsLib.getDocument({ data: source.slice() }).promise
  const output = await PDFDocument.load(source.slice())
  const embeddedFonts = new Map<string, PDFFont>()
  const found = new Set<string>()

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const sourcePage = await pdf.getPage(pageIndex)
    const pageText = await sourcePage.getTextContent()
    const outputPage = output.getPage(pageIndex - 1)

    for (const item of pageText.items) {
      if (!('str' in item) || !item.str.includes('{{')) continue
      const matches = [...item.str.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g)]
      if (!matches.length) continue

      const text = item.str.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_marker, key: string) => {
        const value = values[key]
        if (!value?.trim()) throw new Error(`Preencha o campo ${key.replaceAll('_', ' ')} antes de gerar o PDF.`)
        found.add(key)
        return value
      })
      const transform = (item as { transform?: number[] }).transform
      if (!transform || transform.length < 6) continue

      const x = transform[4]
      const baseline = transform[5]
      const markerWidth = item.width
      const fontSize = Math.hypot(transform[0], transform[1]) || item.height || 11
      const fontFamily = pageText.styles[item.fontName]?.fontFamily.toLowerCase() ?? ''
      const fontName: keyof typeof StandardPdfFonts = /courier|mono/.test(fontFamily) ? 'Courier'
        : /times|serif|georgia|cambria|garamond/.test(fontFamily) ? 'TimesRoman'
          : 'Helvetica'
      let font = embeddedFonts.get(fontName)
      if (!font) {
        font = await output.embedFont(StandardFonts[fontName])
        embeddedFonts.set(fontName, font)
      }
      const fittedFontSize = Math.max(5, Math.min(fontSize, (markerWidth - 2) / font.widthOfTextAtSize(text, 1)))
      const boxHeight = Math.max(item.height, fontSize)

      outputPage.drawRectangle({
        x: x - 1,
        y: baseline - boxHeight * 0.3,
        width: markerWidth + 2,
        height: boxHeight * 1.3,
        color: rgb(1, 1, 1),
      })
      outputPage.drawText(text, { x, y: baseline, size: fittedFontSize, font, color: rgb(0, 0, 0) })
    }
  }

  const missing = Object.keys(values).filter((key) => !found.has(key))
  if (missing.length) {
    throw new Error(`Não localizei no PDF original: ${missing.map((key) => `{{${key}}}`).join(', ')}. Mantenha cada marcador como um trecho contínuo de texto.`)
  }

  return output.save()
}
