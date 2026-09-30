import PizZip from 'pizzip'
const docxUrl = '/miellis-contract-template.docx'

export const OFFICIAL_DOCX_ID = 'miellis-official-sale-promise'

export const OFFICIAL_DOCX_FIELDS = [
  'vendedor_nome', 'vendedor_estado_civil', 'vendedor_endereco', 'vendedor_cidade', 'vendedor_estado', 'vendedor_profissao', 'vendedor_rg', 'vendedor_cpf', 'vendedor_nacionalidade', 'vendedor_email', 'vendedor_telefone',
  'anuente_nome', 'anuente_estado_civil', 'anuente_endereco', 'anuente_cidade', 'anuente_estado', 'anuente_profissao', 'anuente_rg', 'anuente_cpf', 'anuente_nacionalidade', 'anuente_email', 'anuente_telefone',
  'comprador_nome', 'comprador_estado_civil', 'comprador_endereco', 'comprador_cidade', 'comprador_estado', 'comprador_profissao', 'comprador_rg', 'comprador_cpf', 'comprador_nacionalidade', 'comprador_email', 'comprador_telefone',
  'comprador_2_nome', 'comprador_2_estado_civil', 'comprador_2_endereco', 'comprador_2_cidade', 'comprador_2_estado', 'comprador_2_profissao', 'comprador_2_rg', 'comprador_2_cpf', 'comprador_2_nacionalidade', 'comprador_2_email', 'comprador_2_telefone',
  'imovel_descricao', 'imovel_matricula', 'imovel_comarca', 'imovel_cidade', 'imovel_numero_prefeitura', 'imovel_endereco', 'imovel_inscricao_iptu', 'imovel_uc_energia', 'imovel_codigo_agua',
  'valor_total', 'valor_total_extenso', 'valor_sinal', 'valor_sinal_extenso', 'pagamento_sinal_dados', 'valor_comissao', 'valor_comissao_extenso', 'pagamento_comissao_dados', 'valor_parcelado', 'valor_parcelado_extenso', 'quantidade_parcelas', 'quantidade_parcelas_extenso', 'valor_parcela', 'valor_parcela_extenso', 'dia_vencimento', 'dia_vencimento_extenso', 'data_primeiro_vencimento', 'pagamento_parcelas_dados',
  'situacao_averbacao', 'prazo_averbacao_dias', 'situacao_iptu_atual', 'data_assinatura', 'cidade_assinatura', 'corretor_nome', 'corretor_creci',
] as const

export async function createBlankOfficialDocx() {
  const blank = '________________________'
  const values = Object.fromEntries(OFFICIAL_DOCX_FIELDS.map((field) => [field, blank]))
  return createOfficialDocx(values)
}

function replaceInParagraph(paragraph: Element, search: string, replacement: string, startAt = 0) {
  const textNodes = Array.from(paragraph.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't'))
  const fullText = textNodes.map((node) => node.textContent ?? '').join('')
  const start = fullText.indexOf(search, startAt)
  if (start < 0) return false
  const end = start + search.length
  let cursor = 0
  let startNode = -1
  let endNode = -1
  let startOffset = 0
  let endOffset = 0
  for (let index = 0; index < textNodes.length; index += 1) {
    const length = (textNodes[index].textContent ?? '').length
    if (startNode < 0 && start >= cursor && start <= cursor + length) {
      startNode = index
      startOffset = start - cursor
    }
    if (end >= cursor && end <= cursor + length) {
      endNode = index
      endOffset = end - cursor
      break
    }
    cursor += length
  }
  if (startNode < 0 || endNode < 0) return false
  const firstText = textNodes[startNode].textContent ?? ''
  const lastText = textNodes[endNode].textContent ?? ''
  if (startNode === endNode) {
    textNodes[startNode].textContent = firstText.slice(0, startOffset) + replacement + lastText.slice(endOffset)
  } else {
    textNodes[startNode].textContent = firstText.slice(0, startOffset) + replacement
    for (let index = startNode + 1; index < endNode; index += 1) textNodes[index].textContent = ''
    textNodes[endNode].textContent = lastText.slice(endOffset)
  }
  if (replacement.startsWith(' ') || replacement.endsWith(' ')) textNodes[startNode].setAttribute('xml:space', 'preserve')
  return true
}

function replaceEverywhere(paragraphs: Element[], search: string, replacement: string, filter?: (text: string) => boolean) {
  if (!search || search === replacement) return
  const flexibleSearch = search.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  const pattern = new RegExp(flexibleSearch, 'g')
  for (const paragraph of paragraphs) {
    const fullText = paragraph.textContent ?? ''
    if (!filter || filter(fullText)) {
      const currentText = Array.from(paragraph.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')).map((node) => node.textContent ?? '').join('')
      const matches = [...currentText.matchAll(pattern)]
      for (const match of matches.reverse()) {
        if (match.index !== undefined) replaceInParagraph(paragraph, currentText.slice(match.index, match.index + match[0].length), replacement, match.index)
      }
    }
  }
}

function formatContractDate(value: string, long = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return long
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
}

export async function createOfficialDocx(values: Record<string, string>) {
  const response = await fetch(docxUrl)
  if (!response.ok) throw new Error('Não foi possível carregar o modelo Word da Miellis.')
  const zip = new PizZip(await response.arrayBuffer())
  const xmlFile = zip.file('word/document.xml')
  if (!xmlFile) throw new Error('O documento Word da Miellis está incompleto.')
  const xml = new DOMParser().parseFromString(xmlFile.asText(), 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Não foi possível abrir o conteúdo do Word da Miellis.')
  const paragraphs = Array.from(xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p'))
  for (const key of OFFICIAL_DOCX_FIELDS) {
    const value = values[key]?.trim()
    const replacement = value ? formatTemplateField(key, value) : '________________________'
    replaceEverywhere(paragraphs, `{{${key}}}`, replacement)
  }

  const updatedXml = new XMLSerializer().serializeToString(xml)
  zip.file('word/document.xml', updatedXml)
  return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

function formatTemplateField(key: string, value: string) {
  if (key !== 'data_primeiro_vencimento' && key !== 'data_assinatura') return value
  return formatContractDate(value, key === 'data_assinatura')
}
