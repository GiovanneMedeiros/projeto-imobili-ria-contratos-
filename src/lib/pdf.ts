import * as pdfjsLib from 'pdfjs-dist'

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

export async function renderPdfPageToCanvas(file: File, canvas: HTMLCanvasElement) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1.3 })

  canvas.width = viewport.width
  canvas.height = viewport.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível renderizar o PDF.')

  await page.render({ canvas, canvasContext: context, viewport }).promise
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
      .map(([_, segments]) => segments
        .sort((left, right) => left.x - right.x)
        .map((segment) => segment.text)
        .join(' '))
      .join('\n')

    text += `${pageText}\n\n`
  }

  return normalizeImportedPdfText(text)
}
