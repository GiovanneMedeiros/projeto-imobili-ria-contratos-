import PizZip from 'pizzip'
import { formatTemplateValue } from './placeholders'

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const DOCUMENT_PART_PATTERN = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/
const FIELD_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g

function getDocumentParts(zip: PizZip) {
  return Object.keys(zip.files).filter((path) => DOCUMENT_PART_PATTERN.test(path))
}

function parseXml(zip: PizZip, path: string) {
  const file = zip.file(path)
  if (!file) return null
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('O arquivo Word contém uma parte XML inválida.')
  return xml
}

function paragraphText(paragraph: Element) {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, 't')).map((node) => node.textContent ?? '').join('')
}

interface DocxFieldTarget {
  paragraphIndex: number
  key: string
  start: number
  end: number
}

const PERSON_LABELS: { pattern: RegExp; suffix: string }[] = [
  { pattern: /ENDERE[ÇC]O\s+ELETR[ÔO]NICO\s*:/giu, suffix: 'email' },
  { pattern: /ESTADO\s+CIVIL\s*:/giu, suffix: 'estado_civil' },
  { pattern: /NACIONALIDADE\s*:/giu, suffix: 'nacionalidade' },
  { pattern: /PROFISS[ÃA]O\s*:/giu, suffix: 'profissao' },
  { pattern: /ENDERE[ÇC]O\s*:/giu, suffix: 'endereco' },
  { pattern: /CIDADE\s*:/giu, suffix: 'cidade' },
  { pattern: /ESTADO\s*:/giu, suffix: 'estado' },
  { pattern: /NOME(?:\s+COMPLETO)?\s*:/giu, suffix: 'nome' },
  { pattern: /(?:TELEFONE|TEL\.?)\s*:/giu, suffix: 'telefone' },
  { pattern: /RG\s*:/giu, suffix: 'rg' },
  { pattern: /CPF\s*:/giu, suffix: 'cpf' },
]

const PROPERTY_LABELS: { pattern: RegExp; suffix: string }[] = [
  { pattern: /DESCRI[ÇC][ÃA]O(?:\s+DO\s+IM[ÓO]VEL)?\s*:/giu, suffix: 'descricao' },
  { pattern: /MATR[ÍI]CULA\s*:/giu, suffix: 'matricula' },
  { pattern: /CART[ÓO]RIO\s*:/giu, suffix: 'cartorio' },
  { pattern: /COMARCA\s*:/giu, suffix: 'comarca' },
  { pattern: /ENDERE[ÇC]O\s*:/giu, suffix: 'endereco' },
  { pattern: /CIDADE\s*:/giu, suffix: 'cidade' },
  { pattern: /[ÁA]REA\s*:/giu, suffix: 'area' },
  { pattern: /LOTE\s*:/giu, suffix: 'lote' },
  { pattern: /QUADRA\s*:/giu, suffix: 'quadra' },
]

function isWritableSlot(value: string) {
  const trimmed = value.trim()
  return !trimmed || /^[_*\s.\-–—:]+$/u.test(trimmed) || /^\[[^\]]*\]$/u.test(trimmed) || /^\([^)]*\)$/u.test(trimmed)
}

function collectDocxFieldTargets(paragraphs: string[]): DocxFieldTarget[] {
  const targets: DocxFieldTarget[] = []
  let role = ''
  let buyerCount = 0
  let propertySection = false

  paragraphs.forEach((text, paragraphIndex) => {
    const roleHeading = /^\s*(?:(?:PROMITENTE)\s+)?(VENDEDOR(?:A)?|ANUENTE(?:\s+DO\s+LOCADOR)?|LOCADOR(?:A)?|COMPRADOR(?:ES)?|LOCAT[ÁA]RIO(?:S)?)\s*:?/iu.exec(text)
    if (roleHeading) {
      propertySection = false
      const label = roleHeading[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      if (label.startsWith('comprador') || label.startsWith('locatario')) {
        buyerCount += 1
        const prefix = label.startsWith('locatario') ? 'locatario' : 'comprador'
        role = buyerCount === 2 ? `${prefix}_2` : prefix
      } else {
        role = label.startsWith('vendedor') ? 'vendedor' : label.startsWith('locador') ? 'locador' : 'anuente'
      }
      const headingEnd = roleHeading.index + roleHeading[0].length
      const hasColon = roleHeading[0].includes(':')
      if (hasColon) targets.push({ paragraphIndex, key: `${role}_nome`, start: headingEnd, end: text.length })
    }

    const propertyHeading = /\bIM[ÓO]VEL\s*:/iu.exec(text)
    if (propertyHeading) {
      propertySection = true
      targets.push({ paragraphIndex, key: 'imovel_descricao', start: propertyHeading.index + propertyHeading[0].length, end: text.length })
    }

    const fieldLabels = propertySection ? PROPERTY_LABELS : role ? PERSON_LABELS : []
    const matches = fieldLabels.flatMap(({ pattern, suffix }) => [...text.matchAll(pattern)].flatMap((match) => match.index === undefined ? [] : [{ key: propertySection ? `imovel_${suffix}` : `${role}_${suffix}`, start: match.index, end: match.index + match[0].length }]))
      .sort((left, right) => left.start - right.start || right.end - left.end)
    const uniqueMatches = matches.filter((match, index) => !matches.slice(0, index).some((prior) => match.start < prior.end))

    uniqueMatches.forEach((match, index) => {
      const end = uniqueMatches[index + 1]?.start ?? text.length
      if (isWritableSlot(text.slice(match.end, end))) targets.push({ paragraphIndex, key: match.key, start: match.end, end })
    })

    const nameTarget = targets.find((target) => target.paragraphIndex === paragraphIndex && target.key === `${role}_nome`)
    const nextLabel = uniqueMatches[0]?.start ?? text.length
    if (nameTarget && isWritableSlot(text.slice(nameTarget.start, nextLabel))) nameTarget.end = nextLabel
    else if (nameTarget) targets.splice(targets.indexOf(nameTarget), 1)

    const descriptionTarget = targets.find((target) => target.paragraphIndex === paragraphIndex && target.key === 'imovel_descricao')
    if (descriptionTarget) {
      const nextPropertyLabel = uniqueMatches[0]?.start ?? text.length
      if (isWritableSlot(text.slice(descriptionTarget.start, nextPropertyLabel))) descriptionTarget.end = nextPropertyLabel
      else targets.splice(targets.indexOf(descriptionTarget), 1)
    }
  })

  return targets
}

export function inferDocxTemplateFields(text: string) {
  return [...new Set(collectDocxFieldTargets(text.split(/\r?\n/)).map((target) => target.key))]
}

export function extractDocxTextFromBytes(bytes: Uint8Array) {
  const zip = new PizZip(bytes)
  const parts = getDocumentParts(zip)
  if (!parts.includes('word/document.xml')) throw new Error('O arquivo não contém um documento Word válido.')
  return parts.flatMap((path) => {
    const xml = parseXml(zip, path)
    return xml ? Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, 'p')).map(paragraphText) : []
  }).filter(Boolean).join('\n')
}

export async function extractDocxText(file: File) {
  return extractDocxTextFromBytes(new Uint8Array(await file.arrayBuffer()))
}

function replaceParagraphText(paragraph: Element, start: number, end: number, replacement: string) {
  const nodes = Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, 't'))
  const text = nodes.map((node) => node.textContent ?? '').join('')
  let cursor = 0
  let startNode = -1
  let endNode = -1
  let startOffset = 0
  let endOffset = 0

  for (let index = 0; index < nodes.length; index += 1) {
    const length = (nodes[index].textContent ?? '').length
    if (startNode < 0 && start >= cursor && start < cursor + length) {
      startNode = index
      startOffset = start - cursor
    }
    if (end > cursor && end <= cursor + length) {
      endNode = index
      endOffset = end - cursor
      break
    }
    cursor += length
  }

  if (startNode < 0 && start === end && start === text.length && nodes.length) {
    startNode = nodes.length - 1
    endNode = startNode
    startOffset = nodes[startNode].textContent?.length ?? 0
    endOffset = startOffset
  }
  if (startNode < 0 || endNode < 0) return
  const firstText = nodes[startNode].textContent ?? ''
  const lastText = nodes[endNode].textContent ?? ''
  if (startNode === endNode) {
    nodes[startNode].textContent = firstText.slice(0, startOffset) + replacement + firstText.slice(endOffset)
  } else {
    nodes[startNode].textContent = firstText.slice(0, startOffset) + replacement
    for (let index = startNode + 1; index < endNode; index += 1) nodes[index].textContent = ''
    nodes[endNode].textContent = lastText.slice(endOffset)
  }
  if (replacement.startsWith(' ') || replacement.endsWith(' ')) nodes[startNode].setAttribute('xml:space', 'preserve')
}

export function fillDocxTemplate(bytes: Uint8Array, values: Record<string, string>) {
  const zip = new PizZip(bytes)
  const parts = getDocumentParts(zip)
  if (!parts.includes('word/document.xml')) throw new Error('O arquivo não contém um documento Word válido.')

  for (const path of parts) {
    const xml = parseXml(zip, path)
    if (!xml) continue
    const paragraphs = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, 'p'))
    const texts = paragraphs.map(paragraphText)
    const explicitKeys = new Set(texts.flatMap((text) => [...text.matchAll(FIELD_PATTERN)].map((match) => match[1])))
    const targets = collectDocxFieldTargets(texts)

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const text = texts[paragraphIndex]
      const replacements: { start: number; end: number; value: string }[] = []
      for (const match of text.matchAll(FIELD_PATTERN)) {
        const key = match[1]
        if (!key.startsWith('opcional_') && !values[key]?.trim()) {
          throw new Error(`Preencha o campo ${key.replaceAll('_', ' ')} antes de gerar o documento.`)
        }
        replacements.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, value: formatTemplateValue(key, values[key] ?? '') })
      }

      for (const target of targets.filter((item) => item.paragraphIndex === paragraphIndex && !explicitKeys.has(item.key))) {
        const value = values[target.key]?.trim()
        if (value) replacements.push({ start: target.start, end: target.end, value: ` ${formatTemplateValue(target.key, value)}` })
      }

      for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        replaceParagraphText(paragraph, replacement.start, replacement.end, replacement.value)
      }
    })
    zip.file(path, new XMLSerializer().serializeToString(xml))
  }

  return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}