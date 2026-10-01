import { readFile, writeFile } from 'node:fs/promises'
import PizZip from 'pizzip'

const sourcePath = new URL('../public/miellis-contract-template.docx', import.meta.url)
const outputPath = new URL('../public/miellis-rental-contract-template.docx', import.meta.url)
const textNodePattern = /(<w:t(?:\s[^>]*)?(?<!\/)>)((?:(?!<\/w:t>)[\s\S])*)(<\/w:t>)/g

const clauses = [
  {
    key: 'primeira',
    title: 'PRIMEIRA',
    body: 'O LOCADOR dá em locação ao LOCATÁRIO, que aceita, o imóvel descrito neste instrumento, para a finalidade acordada entre as partes, pelo prazo de {{prazo}} meses, com início em {{data_inicio}} e término em {{data_fim}}.',
    paragraphs: {
      primeiro: 'O LOCADOR declara ter legitimidade para locar o imóvel e se compromete a assegurar ao LOCATÁRIO o uso pacífico durante a vigência do contrato.',
      segundo: 'O imóvel será utilizado exclusivamente para a finalidade ajustada. É vedada a cessão, sublocação ou alteração de uso sem autorização prévia e escrita do LOCADOR.',
      terceiro: 'A descrição do imóvel e suas características constam no quadro próprio deste instrumento. A entrega das chaves e o estado de conservação serão registrados em vistoria inicial, que integra o contrato.',
      quarto: 'O LOCADOR declara que, até a entrega das chaves, responderá pelos débitos e ônus anteriores à locação que sejam de sua responsabilidade e que impeçam o uso regular do imóvel, sem prejuízo das demais obrigações previstas em lei.',
    },
  },
  {
    key: 'segunda',
    title: 'SEGUNDA',
    body: 'O aluguel mensal é de R$ {{valor_aluguel}} ({{valor_aluguel_extenso}}), com vencimento no dia {{dia_vencimento}} de cada mês, iniciando em {{data_primeiro_vencimento}}, por meio de {{forma_pagamento}}. O valor será reajustado a cada período de 12 meses pelo índice {{opcional_indice_reajuste}}, ou por aquele que legalmente o substituir.',
  },
  {
    key: 'terceira',
    title: 'TERCEIRA',
    body: 'Para garantia das obrigações da locação, as partes elegem a modalidade {{garantia}}, observadas as garantias admitidas pelo art. 37 da Lei nº 8.245/1991, sem cumulação de modalidades.',
    items: {
      a: 'Se escolhida caução em dinheiro, o valor será de R$ {{opcional_valor_caucao}}, limitado a três meses de aluguel e depositado em caderneta de poupança, com restituição e rendimentos ao LOCATÁRIO após a entrega das chaves e apuração de eventuais débitos.',
      b: 'Se escolhida fiança, o fiador será {{opcional_fiador_nome}}, inscrito no CPF sob nº {{opcional_fiador_cpf}}, que assinará este instrumento e responderá nos limites aqui pactuados.',
      c: 'Se escolhido seguro-fiança, o LOCATÁRIO contratará e manterá vigente a apólice {{opcional_seguro_fianca}}, apresentando comprovantes ao LOCADOR sempre que solicitado.',
    },
    paragraphs: {
      unico: 'Encerrada a locação, a garantia será liberada após a vistoria de saída e a quitação das obrigações vencidas, ressalvado o prazo necessário para apuração de débitos comprovados.',
    },
  },
  {
    key: 'quarta',
    title: 'QUARTA',
    body: 'O atraso no pagamento do aluguel ou dos encargos previstos neste contrato sujeitará o LOCATÁRIO à multa de {{opcional_multa_atraso}}%, juros de mora de {{opcional_juros_atraso}}% ao mês e correção monetária pelo índice legal aplicável, calculados desde o vencimento até o pagamento.',
    paragraphs: {
      primeiro: 'Persistindo a inadimplência, o LOCADOR poderá cobrar os valores devidos pelos meios legais e promover as medidas cabíveis, inclusive a rescisão da locação e o despejo, observada a legislação vigente.',
      segundo: 'O descumprimento contratual poderá ensejar a rescisão, sem prejuízo da cobrança de aluguéis, encargos, multas proporcionais e demais valores comprovadamente devidos.',
    },
  },
  {
    key: 'quinta',
    title: 'QUINTA',
    body: 'São obrigações do LOCADOR entregar o imóvel em condições de servir ao uso contratado, garantir o uso pacífico durante a locação, responder por vícios anteriores à entrega e fornecer recibos discriminados dos valores pagos.',
  },
  {
    key: 'sexta',
    title: 'SEXTA',
    body: 'São obrigações do LOCATÁRIO pagar pontualmente o aluguel e os encargos que lhe forem atribuídos, conservar o imóvel, utilizá-lo conforme a finalidade contratada e devolvê-lo ao final da locação no estado registrado na vistoria inicial, ressalvado o desgaste natural.',
  },
  {
    key: 'setima',
    title: 'SÉTIMA',
    body: 'As despesas de consumo individual de água, energia elétrica, gás, telefone e serviços contratados pelo LOCATÁRIO serão de sua responsabilidade a partir da entrega das chaves.',
    paragraphs: {
      primeiro: 'O LOCATÁRIO solicitará, quando aplicável, a transferência das contas de consumo para seu nome e apresentará os comprovantes de quitação ao término da locação.',
      segundo: 'O pagamento do IPTU e das despesas ordinárias de condomínio ficará a cargo de {{opcional_responsavel_iptu_condominio}}, conforme ajuste expresso entre as partes e legislação aplicável.',
      terceiro: 'As despesas extraordinárias de condomínio e os reparos estruturais não causados pelo LOCATÁRIO serão de responsabilidade do LOCADOR, nos termos da lei.',
      quarto: 'O LOCADOR poderá vistoriar o imóvel mediante combinação prévia de dia e horário com o LOCATÁRIO, ressalvadas situações urgentes previstas em lei.',
    },
  },
  {
    key: 'oitava',
    title: 'OITAVA',
    body: 'O imóvel será entregue conforme o laudo de vistoria inicial, que deverá ser conferido e assinado pelas partes. O LOCATÁRIO comunicará por escrito defeitos que não constem do laudo assim que forem identificados.',
  },
  {
    key: 'nona',
    title: 'NONA',
    body: 'As partes comprometem-se a cumprir as obrigações previstas neste contrato e na Lei nº 8.245/1991. Comunicações relativas à locação deverão ser feitas por escrito aos endereços ou contatos informados pelas partes.',
  },
  {
    key: 'decima',
    title: 'DÉCIMA',
    body: 'A locação poderá ser encerrada nas hipóteses previstas neste contrato e na legislação aplicável, inclusive pelo término do prazo, acordo entre as partes, infração legal ou contratual, falta de pagamento ou demais causas legais.',
    paragraphs: {
      unico: 'Se o LOCATÁRIO devolver o imóvel antes do término do prazo, pagará multa compensatória proporcional ao período restante, calculada conforme este contrato e o art. 4º da Lei nº 8.245/1991, ressalvadas as hipóteses legais de dispensa.',
    },
  },
  {
    key: 'decimaPrimeira',
    title: 'DÉCIMA PRIMEIRA',
    body: 'A intermediação da locação é realizada por {{imobiliaria_nome}}, CRECI nº {{opcional_imobiliaria_creci}}, através de {{corretor_nome}}, CRECI {{corretor_creci}}. A remuneração pelos serviços de intermediação será de R$ {{valor_comissao}} ({{valor_comissao_extenso}}), paga por {{pagamento_comissao_dados}}.',
    paragraphs: {
      primeiro: 'A comissão de intermediação será devida conforme o ajuste firmado com a imobiliária e após a efetiva conclusão da locação, observadas as condições pactuadas entre os responsáveis pelo pagamento.',
      segundo: 'Eventual rescisão posterior da locação não afasta a remuneração por serviços de intermediação já prestados, conforme contrato próprio e legislação aplicável.',
    },
  },
  {
    key: 'decimaSegunda',
    title: 'DÉCIMA SEGUNDA',
    body: 'Este contrato obriga as partes e seus sucessores ao cumprimento das condições aqui pactuadas, respeitados os direitos de prorrogação, denúncia e retomada previstos na Lei nº 8.245/1991.',
  },
  {
    key: 'decimaTerceira',
    title: 'DÉCIMA TERCEIRA',
    body: 'Os casos omissos serão resolvidos de acordo com a Lei nº 8.245/1991 e demais normas aplicáveis. Fica eleito o foro da situação do imóvel para dirimir questões decorrentes deste contrato, ressalvadas as regras legais de competência.',
  },
]

const clauseByKey = new Map(clauses.map((clause) => [clause.key, clause]))
const titleToKey = new Map(clauses.map((clause) => [normalize(clause.title), clause.key]))

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase()
}

function decodeXml(value) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function encodeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function getParagraphData(paragraph) {
  const nodes = [...paragraph.matchAll(textNodePattern)].map((match) => ({ open: match[1], text: decodeXml(match[2]), close: match[3] }))
  return { nodes, text: nodes.map((node) => node.text).join('') }
}

function replaceParagraphRange(paragraph, start, end, replacement) {
  const { nodes } = getParagraphData(paragraph)
  let cursor = 0
  let startNode = -1
  let endNode = -1
  let startOffset = 0
  let endOffset = 0

  for (let index = 0; index < nodes.length; index += 1) {
    const length = nodes[index].text.length
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
  if (startNode < 0 || endNode < 0) return paragraph

  const firstText = nodes[startNode].text
  const lastText = nodes[endNode].text
  if (startNode === endNode) {
    nodes[startNode].text = firstText.slice(0, startOffset) + replacement + firstText.slice(endOffset)
  } else {
    nodes[startNode].text = firstText.slice(0, startOffset) + replacement
    for (let index = startNode + 1; index < endNode; index += 1) nodes[index].text = ''
    nodes[endNode].text = lastText.slice(endOffset)
  }

  let nodeIndex = 0
  return paragraph.replace(textNodePattern, (_match, open, _text, close) => `${open}${encodeXml(nodes[nodeIndex++].text)}${close}`)
}

function replaceMatches(paragraph, pattern, replacement) {
  const { text } = getParagraphData(paragraph)
  const matches = [...text.matchAll(pattern)]
  let updated = paragraph
  for (const match of matches.reverse()) {
    if (match.index === undefined) continue
    const value = typeof replacement === 'function' ? replacement(match) : replacement
    updated = replaceParagraphRange(updated, match.index, match.index + match[0].length, value)
  }
  return updated
}

function replacePhrase(paragraph, phrase, replacement) {
  const pattern = new RegExp(phrase.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'giu')
  return replaceMatches(paragraph, pattern, replacement)
}

function replaceTail(paragraph, prefix, replacement) {
  const { text } = getParagraphData(paragraph)
  return replaceParagraphRange(paragraph, prefix.length, text.length, ` ${replacement}`)
}

function transformParagraph(paragraph, state) {
  let updated = paragraph
  const titleText = getParagraphData(updated).text
  const title = /^((?:D[ÉE]CIMA\s+(?:PRIMEIRA|SEGUNDA|TERCEIRA)|D[ÉE]CIMA|S[ÉE]TIMA|PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA|OITAVA|NONA)\s*[–-])\s*/iu.exec(titleText)
  if (title) {
    const key = titleToKey.get(normalize(title[1].replace(/[–-]$/, '')))
    if (key) {
      state.clause = key
      const clause = clauseByKey.get(key)
      return replaceTail(updated, title[1], clause.body)
    }
  }

  const { text } = getParagraphData(updated)
  const paragraphLabel = /^(Parágrafo\s+(Primeiro|Segundo|Terceiro|Quarto|Único)\s*:)/iu.exec(text)
  if (paragraphLabel && state.clause) {
    const ordinal = normalize(paragraphLabel[2])
    const body = clauseByKey.get(state.clause)?.paragraphs?.[ordinal]
    if (body) return replaceTail(updated, paragraphLabel[1], body)
  }

  if (state.clause === 'terceira') {
    const itemLabel = /^([abc]\))/iu.exec(text)
    if (itemLabel) {
      const body = clauseByKey.get(state.clause)?.items?.[itemLabel[1][0].toLowerCase()]
      if (body) return replaceTail(updated, itemLabel[1], body)
    }
  }

  if (/^IM[ÓO]VEL\s*:/iu.test(text)) return replaceTail(updated, text.slice(0, text.indexOf(':') + 1), '{{imovel_descricao}}')
  return updated
}

const roleAndFieldReplacements = [
  ['{{comprador_2_', '{{locatario_2_'],
  ['{{comprador_', '{{locatario_'],
  ['{{vendedor_', '{{locador_'],
  ['PROMITENTES COMPRADORES', 'LOCATÁRIOS'],
  ['PROMITENTE COMPRADOR', 'LOCATÁRIO'],
  ['PROMITENTES VENDEDORAS', 'LOCADORAS'],
  ['PROMITENTES VENDEDORES', 'LOCADORES'],
  ['PROMITENTE VENDEDORA', 'LOCADORA'],
  ['PROMITENTE VENDEDOR', 'LOCADOR'],
  ['PROMITENTE ANUENTE', 'ANUENTE DO LOCADOR'],
  ['VENDEDORAS', 'LOCADORAS'],
  ['VENDEDORES', 'LOCADORES'],
  ['VENDEDORA', 'LOCADORA'],
  ['VENDEDOR', 'LOCADOR'],
  ['COMPRADORES', 'LOCATÁRIOS'],
  ['COMPRADOR', 'LOCATÁRIO'],
  ['CONTRATO DE PROMESSA DE COMPRA E VENDA', 'CONTRATO DE LOCAÇÃO DE IMÓVEL'],
  ['Promessa de Compra e Venda de imóvel', 'Locação de Imóvel'],
  ['Promessa de Compra e Venda', 'Locação'],
  ['[NOME VENDEDOR]', '{{locador_nome}}'],
  ['[NOME ANUENTE]', '{{anuente_nome}}'],
  ['[NOME COMPRADOR 1]', '{{locatario_nome}}'],
  ['[NOME COMPRADOR 2]', '{{locatario_2_nome}}'],
]

const placeholderReplacements = [
  ['{{valor_total_extenso}}', '{{valor_aluguel_extenso}}'],
  ['{{valor_total}}', '{{valor_aluguel}}'],
  ['{{valor_sinal_extenso}}', '{{opcional_valor_caucao_extenso}}'],
  ['{{valor_sinal}}', '{{opcional_valor_caucao}}'],
  ['{{valor_parcelado_extenso}}', '{{valor_aluguel_extenso}}'],
  ['{{valor_parcelado}}', '{{valor_aluguel}}'],
  ['{{valor_parcela_extenso}}', '{{valor_aluguel_extenso}}'],
  ['{{valor_parcela}}', '{{valor_aluguel}}'],
  ['{{pagamento_sinal_dados}}', '{{forma_pagamento}}'],
  ['{{pagamento_parcelas_dados}}', '{{forma_pagamento}}'],
]

const sourceBytes = await readFile(sourcePath)
const zip = new PizZip(sourceBytes)
const document = zip.file('word/document.xml')
if (!document) throw new Error('O modelo original não contém word/document.xml.')

const originalXml = document.asText()
const originalParagraphCount = [...originalXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].length
let clauseState = { clause: '' }
let transformedXml = originalXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
  let updated = paragraph
  for (const [search, replacement] of roleAndFieldReplacements) updated = replacePhrase(updated, search, replacement)
  for (const [search, replacement] of placeholderReplacements) updated = replacePhrase(updated, search, replacement)
  updated = replacePhrase(updated, 'CONTRATO DE PROMESSA DE COMPRA E VENDA', 'CONTRATO DE LOCAÇÃO DE IMÓVEL')
  return transformParagraph(updated, clauseState)
})

const transformedParagraphCount = [...transformedXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].length
if (originalParagraphCount !== transformedParagraphCount) throw new Error('A conversão alterou a quantidade de parágrafos do documento.')

zip.file('word/document.xml', transformedXml)
await writeFile(outputPath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.info(`Modelo de locação criado: ${outputPath.pathname}`)
console.info(`Parágrafos preservados: ${transformedParagraphCount}`)