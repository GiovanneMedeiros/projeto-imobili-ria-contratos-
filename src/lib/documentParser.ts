// Extração de dados estruturados a partir do texto (OCR ou PDF) de documentos brasileiros.
// Regra: nunca inventar. Se o dado não for encontrado, ele fica ausente; tudo que não pode ser validado vem com confiança "low".

export type DocumentKind = 'rg' | 'cnh' | 'cpf' | 'nascimento' | 'casamento' | 'residencia' | 'matricula'

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  rg: 'RG',
  cnh: 'CNH',
  cpf: 'CPF',
  nascimento: 'Certidão de nascimento',
  casamento: 'Certidão de casamento',
  residencia: 'Comprovante de residência',
  matricula: 'Matrícula do imóvel',
}

export interface Extracted { value: string; confidence: 'high' | 'low' }
export type PersonKey = 'nome' | 'cpf' | 'rg' | 'data_nascimento' | 'estado_civil' | 'profissao' | 'nacionalidade' | 'endereco' | 'cidade' | 'estado' | 'cep'
export type PropertyKey = 'matricula' | 'cartorio' | 'comarca' | 'endereco' | 'cidade' | 'area' | 'lote' | 'quadra' | 'descricao'

export interface PersonExtraction {
  kind: DocumentKind
  fields: Partial<Record<PersonKey, Extracted>>
  nameCandidates: string[]
  cpfs: string[]
  notes: string[]
}

export interface PropertyExtraction {
  fields: Partial<Record<PropertyKey, Extracted>>
  owners: { nome: string; cpf?: string }[]
  notes: string[]
}

const UF = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO'
const STREET = /\b(RUA|R\.|AVENIDA|AV\.?|ALAMEDA|AL\.|TRAVESSA|TV\.|ESTRADA|ROD\.|RODOVIA|PRACA|LARGO|VIELA|SERVIDAO|LINHA|SITIO|CHACARA|FAZENDA)\s+\S/
const NAME_STOPWORDS = /\b(FILIACAO|NASCIMENTO|DATA|REGISTRO|ASSINATURA|NATURALIDADE|DOC|CPF|VALIDADE|PAI|MAE|REPUBLICA|FEDERATIVA|BRASIL|CARTEIRA|IDENTIDADE|HABILITACAO|CATEGORIA|EXPEDICAO|ORGAO|EMISSOR|CERTIDAO|CARTORIO|OFICIAL|LIVRO|FOLHA|TERMO|MATRICULA|SEXO|LOCAL|PERMISSAO|SECRETARIA|MINISTERIO|NOME|OBSERVACOES|AVERBACOES)\b/
const OWNER_STOPWORDS = /^(PROPRIETARI\w*|BRASILEIR\w*|CASAD\w*|SOLTEIR\w*|DIVORCIAD\w*|VIUV\w*|SEPARAD\w*|CPF|RG|SSP|CNPJ|MF|RUA|AVENIDA|PORTADOR\w*|INSCRIT\w*|RESIDENTE\w*|DOMICILIAD\w*|REGIME|COMUNHAO|PARCIAL|UNIVERSAL|BENS|LEI|CI|CPF\/MF|NESTA|CIDADE|COM|SEU|SUA|CONJUGE|ESPOSA|MARIDO|EMPRESARI\w*|COMERCIANTE|AGRICULTOR\w*|APOSENTAD\w*|ADVOGAD\w*|MEDIC\w*|ENGENHEIR\w*|PROFESSOR\w*|DO LAR|MAIOR\w*|CAPAZ\w*)$/

// Mesmo comprimento do texto original (índices alinhados), sem acentos e em maiúsculas.
function toKey(text: string) {
  return Array.from(text, (char) => char.length > 1 ? char : ((char.normalize('NFD')[0] ?? char).toUpperCase().charAt(0) || char)).join('')
}

const low = (value?: string): Extracted | undefined => value?.trim() ? { value: value.trim(), confidence: 'low' } : undefined
const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

export function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  for (const length of [9, 10]) {
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index)
    const check = (sum * 10) % 11 % 10
    if (check !== Number(digits[length])) return false
  }
  return true
}

function formatCpf(digits: string) {
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

function findCpfs(text: string) {
  const found: { value: string; index: number }[] = []
  for (const match of text.matchAll(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[\s.\-/]?\d{2}/g)) {
    const digits = match[0].replace(/\D/g, '')
    if (isValidCpf(digits) && !found.some((item) => item.value === formatCpf(digits))) found.push({ value: formatCpf(digits), index: match.index ?? 0 })
  }
  return found
}

function findDateAfter(key: string, text: string, label: RegExp, window = 140) {
  const match = label.exec(key)
  if (!match) return ''
  const slice = text.slice(match.index, match.index + match[0].length + window)
  return /\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/.exec(slice)?.slice(1, 4).join('/') ?? ''
}

function valueAfterLabel(lines: string[], keys: string[], label: RegExp, maxLines = 2, skip?: RegExp) {
  const results: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = label.exec(keys[index])
    if (!match || skip?.test(keys[index])) continue
    const rest = lines[index].slice(match.index + match[0].length).replace(/^[\s:.\-–]+/, '').trim()
    if ((rest.match(/[A-Za-zÀ-ÿ]/g) ?? []).length >= 3) results.push(rest)
    else {
      for (let next = index + 1; next <= Math.min(lines.length - 1, index + maxLines); next += 1) {
        if (lines[next].trim()) { results.push(lines[next].trim()); break }
      }
    }
  }
  return results
}

function cleanName(value: string) {
  const name = clean(value.replace(/[^A-Za-zÀ-ÿ' ]/g, ' '))
  const words = name.split(' ').filter((word) => word.length > 1 || /^[eE]$/.test(word))
  if (words.length < 2 || NAME_STOPWORDS.test(toKey(name))) return ''
  return words.join(' ')
}

export function detectDocumentKind(text: string): DocumentKind {
  const key = toKey(text)
  if (/MATRICULA/.test(key) && /REGISTRO DE IMOVEIS|REGISTRO GERAL DE IMOVEIS|OFICIAL DE REGISTRO|LIVRO\s*(N\S*\s*)?2|FICHA/.test(key)) return 'matricula'
  if (/HABILITACAO|PERMISSAO PARA DIRIGIR|\bCNH\b/.test(key)) return 'cnh'
  if (/CERTIDAO/.test(key) && /CASAMENTO/.test(key)) return 'casamento'
  if (/CERTIDAO/.test(key) && /NASCIMENTO/.test(key)) return 'nascimento'
  if (/REGISTRO GERAL|CARTEIRA DE IDENTIDADE|CEDULA DE IDENTIDADE|CARTEIRA DE IDENTIDADE NACIONAL/.test(key)) return 'rg'
  if (/CADASTRO DE PESSOAS FISICAS|COMPROVANTE DE (SITUACAO|INSCRICAO) CADASTRAL/.test(key)) return 'cpf'
  return 'residencia'
}

export function parsePersonDocument(text: string, kind: DocumentKind): PersonExtraction {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim())
  const keys = lines.map(toKey)
  const key = toKey(text)
  const fields: PersonExtraction['fields'] = {}
  const notes: string[] = []
  const cpfs = findCpfs(text)

  const labeledNames = valueAfterLabel(lines, keys, /\bNOMES?(\s*(E|\/)\s*SOBRENOME)?(\s+SOCIAL)?\b/, 2, /\b(PAI|MAE|FILIACAO|GENITOR)\b/)
    .concat(valueAfterLabel(lines, keys, /\b(CONTRAENTE|CONJUGE|NUBENTE)S?\b/, 2))
  // Na certidão de casamento os dois nomes costumam vir em linhas próprias, em maiúsculas.
  const upperCaseLines = kind === 'casamento' ? lines.filter((line) => line.length > 6 && line === line.toLocaleUpperCase('pt-BR') && !/\d/.test(line)) : []
  const nameCandidates = [...new Set(labeledNames.concat(upperCaseLines).map(cleanName).filter(Boolean))]

  if (kind !== 'casamento' && kind !== 'residencia') {
    fields.nome = low(nameCandidates[0])
    if (cpfs[0]) fields.cpf = { value: cpfs[0].value, confidence: 'high' }
  }
  if (kind === 'residencia' && cpfs[0]) fields.cpf = { value: cpfs[0].value, confidence: 'high' }

  if (kind === 'rg' || kind === 'cnh') {
    const rgLabel = /(REGISTRO GERAL|DOC\.?\s*IDENTIDADE|CARTEIRA DE IDENTIDADE|\bR\.?\s?G\.?\b|IDENTIDADE)/g
    const cpfDigits = cpfs.map((item) => item.value.replace(/\D/g, ''))
    for (const match of key.matchAll(rgLabel)) {
      const window = text.slice(match.index ?? 0, (match.index ?? 0) + 160)
      const number = [...window.matchAll(/\b\d{1,3}(?:[.\s]?\d{3}){1,2}(?:[-\s]?[\dXx])?\b/g)]
        .map((item) => item[0].trim())
        .find((item) => { const digits = item.replace(/\D/g, ''); return digits.length >= 5 && digits.length <= 10 && !cpfDigits.some((cpf) => cpf.includes(digits)) })
      if (number) {
        const issuer = /\b(SSP|SESP|SDS|SSPDS|PC|PCMG|IIRGD|DETRAN|DGPC|SEJUSP|IFP|DIC|IGP|SPTC)\s*[/-]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)?\b/.exec(toKey(window))
        fields.rg = low(issuer ? `${number} ${issuer[1]}${issuer[2] ? `/${issuer[2]}` : ''}` : number)
        break
      }
    }
    if (/REPUBLICA FEDERATIVA DO BRASIL/.test(key)) fields.nacionalidade = low('brasileiro(a)')
  }

  const birth = findDateAfter(key, text, /NASCIMENTO/)
  if (birth && kind !== 'casamento' && kind !== 'residencia') fields.data_nascimento = low(birth)

  const nationality = valueAfterLabel(lines, keys, /\bNACIONALIDADE\b/, 1)[0]
  if (nationality) fields.nacionalidade = low(nationality.split(/[\s,;]/)[0].toLowerCase())

  const profession = valueAfterLabel(lines, keys, /\bPROFISSAO\b/, 1)[0]
  if (profession) fields.profissao = low(profession.split(/[,;]/)[0].slice(0, 60).toLowerCase())

  if (kind === 'casamento') {
    const regime = /REGIME[^\n]{0,40}?(COMUNHAO PARCIAL|COMUNHAO UNIVERSAL|SEPARACAO (?:TOTAL |CONVENCIONAL |OBRIGATORIA )?DE BENS|SEPARACAO (?:TOTAL|CONVENCIONAL|OBRIGATORIA)|PARTICIPACAO FINAL NOS AQUESTOS)/.exec(key)
    const regimeName = regime ? text.slice(regime.index + regime[0].length - regime[1].length, regime.index + regime[0].length).toLowerCase() : ''
    const regimeText = regimeName && !/bens|aquestos/.test(regimeName) ? `${regimeName} de bens` : regimeName
    if (/DIVORCI/.test(key)) { fields.estado_civil = low('divorciado(a)'); notes.push('A certidão de casamento tem averbação de divórcio.') }
    else fields.estado_civil = low(regimeText ? `casado(a) sob o regime da ${regimeText}` : 'casado(a)')
  } else if (kind === 'nascimento') {
    fields.estado_civil = low('solteiro(a)')
    notes.push('Estado civil "solteiro(a)" deduzido da certidão de nascimento — confirme se não há averbações.')
  } else {
    const civil = /ESTADO CIVIL\s*:?\s*(SOLTEIR|CASAD|DIVORCIAD|VIUV|SEPARAD)/.exec(key)
    if (civil) fields.estado_civil = low({ SOLTEIR: 'solteiro(a)', CASAD: 'casado(a)', DIVORCIAD: 'divorciado(a)', VIUV: 'viúvo(a)', SEPARAD: 'separado(a)' }[civil[1]])
  }

  if (kind === 'residencia') Object.assign(fields, parseAddress(lines, keys))

  return { kind, fields, nameCandidates, cpfs: cpfs.map((item) => item.value), notes }
}

function parseAddress(lines: string[], keys: string[]) {
  const result: Partial<Record<PersonKey, Extracted>> = {}
  const cepLines = keys.map((line, index) => ({ index, match: /\b(\d{5})-?(\d{3})\b/.exec(line) })).filter((item) => item.match)
  const streetLines = keys.map((line, index) => ({ index, match: STREET.exec(line) })).filter((item) => item.match && (item.match.index ?? 99) <= 25)
  const street = streetLines.find((item) => cepLines.some((cep) => cep.index >= item.index && cep.index - item.index <= 3)) ?? streetLines[0]
  if (!street && !cepLines.length) return result
  const cep = cepLines.find((item) => !street || (item.index >= street.index && item.index - street.index <= 3)) ?? cepLines[0]
  if (street) result.endereco = low(lines[street.index].slice(street.match?.index ?? 0).replace(/\bCEP\b.*$/i, '').replace(/[\s,-]+$/, ''))
  if (cep?.match) result.cep = low(`${cep.match[1]}-${cep.match[2]}`)
  const from = street?.index ?? cep?.index ?? 0
  for (let index = from; index <= Math.min(lines.length - 1, from + 4); index += 1) {
    const city = new RegExp(`([A-Z][A-Z .'-]{2,40}?)\\s*[-/]\\s*(${UF})\\b`).exec(keys[index].replace(/\d/g, ' '))
    if (city && !STREET.test(city[1])) {
      result.cidade = low(clean(lines[index].slice(city.index, city.index + city[1].length).replace(/\d/g, '')))
      result.estado = low(city[2])
      break
    }
  }
  return result
}

export function parsePropertyRegistration(text: string): PropertyExtraction {
  const key = toKey(text)
  const fields: PropertyExtraction['fields'] = {}
  const notes: string[] = []

  const number = /MATRICULA\s*(?:N\S{0,2}|NUMERO|No\.?)?\s*[:.-]?\s*(\d[\d.]*\d|\d)/.exec(key)
  if (number) fields.matricula = low(number[1])

  const officeLine = text.split(/\r?\n/).find((line) => /REGISTRO (GERAL )?DE IMOVEIS|OFICIO|CARTORIO/.test(toKey(line)))
  if (officeLine) fields.cartorio = low(clean(officeLine).slice(0, 120))

  const comarca = /COMARCA DE ([A-Z][A-Z .'-]{2,40}?)(?=\s*[-/,.\n(]|\s+-|\s+ESTADO|$)/m.exec(key)
  if (comarca) fields.comarca = low(clean(text.slice(comarca.index + 11, comarca.index + 11 + comarca[1].length)))

  const city = /(?:MUNICIPIO|CIDADE) DE ([A-Z][A-Z .'-]{2,40}?)(?=\s*[-/,.\n(]|\s+ESTADO|$)/m.exec(key)
  if (city) {
    const start = city.index + city[0].length - city[1].length
    fields.cidade = low(clean(text.slice(start, start + city[1].length)))
  }

  const ownerStart = key.search(/PROPRIETARI[OA]S?\s*[:(]/)
  const descStartMatch = /\bIMOVEL\s*:|\bDESCRICAO DO IMOVEL\b|\bDESCRICAO\s*:/.exec(key)
  const descStart = descStartMatch ? descStartMatch.index + descStartMatch[0].length
    : key.search(/\b(UM |UMA |O )?(LOTE|TERRENO|APARTAMENTO|CASA|SALA|GLEBA|IMOVEL RURAL|UNIDADE AUTONOMA)\b/)
  if (descStart >= 0) {
    const endCandidates = [ownerStart > descStart ? ownerStart : -1, ...[/REGISTRO ANTERIOR/, /\bR\.?\s*[-–]?\s*0?1\s*[-–/]/, /\bAV\.?\s*[-–]?\s*0?1\s*[-–/]/].map((pattern) => {
      const found = key.slice(descStart + 20).search(pattern)
      return found < 0 ? -1 : found + descStart + 20
    })].filter((value) => value > descStart)
    const descEnd = endCandidates.length ? Math.min(...endCandidates) : Math.min(key.length, descStart + 2500)
    const description = clean(text.slice(descStart, descEnd)).replace(/^[\s:.-]+/, '').slice(0, 4000)
    if (description.length > 30) fields.descricao = low(description)
    const descKey = toKey(description)
    const area = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(M2|M²|MTS2|METROS QUADRADOS)/.exec(descKey)
    if (area) fields.area = low(`${area[1]} m²`)
    const lot = /\bLOTE\s*(?:DE TERRENO\s*)?(?:SOB\s*)?(?:N\S{0,2}\s*)?(\d[0-9A-Z]{0,5}|[A-Z]\b)/.exec(descKey)
    if (lot) fields.lote = low(lot[1])
    const block = /\bQUADRA\s*(?:N\S{0,2}\s*)?(\d[0-9A-Z]{0,5}|[A-Z]\b)/.exec(descKey)
    if (block) fields.quadra = low(block[1])
    const address = new RegExp(`${STREET.source.replace('\\s+\\S', '')}\\s+[^,;]+(?:,\\s*(?:N\\S{0,2}\\s*)?\\d+)?`).exec(descKey)
    if (address) fields.endereco = low(clean(description.slice(address.index, address.index + address[0].length)))
  }

  const owners: PropertyExtraction['owners'] = []
  if (ownerStart >= 0) {
    const rest = key.slice(ownerStart + 12)
    const endRel = rest.search(/REGISTRO ANTERIOR|\bR\.?\s*[-–]?\s*0?1\s*[-–/]|TITULO AQUISITIVO|\bAV\.?\s*[-–]?\s*0?1\s*[-–/]/)
    const sectionStart = ownerStart + 12
    const sectionEnd = sectionStart + (endRel < 0 ? Math.min(rest.length, 900) : endRel)
    const section = text.slice(sectionStart, sectionEnd)
    const sectionCpfs = findCpfs(section)
    const names: { nome: string; index: number }[] = []
    for (const match of section.matchAll(/[A-ZÀ-Ý][A-ZÀ-Ý']+(?:\s+(?:(?:DA|DE|DO|DAS|DOS|E)\s+)?[A-ZÀ-Ý][A-ZÀ-Ý']+){1,7}/g)) {
      const tokens = match[0].split(/\s+/)
      const kept: string[] = []
      for (const token of tokens) {
        if (OWNER_STOPWORDS.test(toKey(token))) { if (kept.length) break; continue }
        kept.push(token)
      }
      while (kept.length && /^(DA|DE|DO|DAS|DOS|E)$/.test(kept[kept.length - 1])) kept.pop()
      if (kept.length >= 2) names.push({ nome: kept.join(' '), index: (match.index ?? 0) + match[0].indexOf(kept[0]) })
    }
    if (!names.length) {
      const fallback = cleanName(section.replace(/^[\s:()A-Za-z]*?[:)]\s*/, '').split(/[,;]/)[0] ?? '')
      if (fallback) names.push({ nome: fallback, index: 0 })
    }
    names.forEach((item, index) => {
      const nextIndex = names[index + 1]?.index ?? Infinity
      const cpf = sectionCpfs.find((entry) => entry.index > item.index && entry.index < nextIndex)
      owners.push({ nome: item.nome, cpf: cpf?.value })
    })
  }
  if (/\bR\.?\s*[-–]?\s*0?[2-9]\s*[-–/]/.test(key)) {
    notes.push('A matrícula tem registros posteriores (R.2 ou seguintes). Confirme quem é o proprietário atual antes de usar como vendedor.')
  }
  if (!owners.length) notes.push('Proprietários não identificados automaticamente.')
  return { fields, owners, notes }
}
