const placeholderPattern = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g

const fieldLabels: Record<string, string> = {
  locador_nome: 'Nome do locador',
  locador_cpf: 'CPF/CNPJ do locador',
  locador_telefone: 'Telefone do locador',
  locador_email: 'E-mail do locador',
  locatario_nome: 'Nome do locatário',
  locatario_cpf: 'CPF/CNPJ do locatário',
  locatario_telefone: 'Telefone do locatário',
  locatario_email: 'E-mail do locatário',
  imovel_endereco: 'Endereço completo',
  imovel_numero: 'Número',
  imovel_complemento: 'Complemento',
  imovel_bairro: 'Bairro',
  imovel_cidade: 'Cidade',
  imovel_estado: 'Estado',
  imovel_cep: 'CEP',
  imovel_matricula: 'Matrícula',
  valor_aluguel: 'Valor do aluguel',
  valor_condominio: 'Condomínio',
  valor_iptu: 'IPTU',
  forma_pagamento: 'Forma de pagamento',
  garantia: 'Garantia',
  data_inicio: 'Data inicial',
  data_fim: 'Data final',
  prazo: 'Prazo',
  observacoes: 'Observações',
}

const fieldWords: Record<string, string> = {
  vendedor: 'Vendedor(a)', comprador: 'Comprador(a)', anuente: 'Anuente', nome: 'Nome',
  estado: 'Estado', civil: 'Civil', endereco: 'Endereço', cidade: 'Cidade', profissao: 'Profissão',
  rg: 'RG', cpf: 'CPF', cnpj: 'CNPJ', nacionalidade: 'Nacionalidade', email: 'E-mail', telefone: 'Telefone',
  imovel: 'Imóvel', descricao: 'Descrição', matricula: 'Matrícula', comarca: 'Comarca', numero: 'Número',
  cadastro: 'Cadastro', inscricao: 'Inscrição', iptu: 'IPTU', concessionaria: 'Concessionária', energia: 'Energia',
  uc: 'UC', agua: 'Água', codigo: 'Código', situacao: 'Situação', averbacao: 'Averbação', prazo: 'Prazo',
  dias: 'Dias', horas: 'Horas', partes: 'Partes', adicionais: 'Adicionais', valor: 'Valor', total: 'Total',
  extenso: 'Por extenso', sinal: 'Sinal', parcelado: 'Parcelado', parcela: 'Parcela', parcelas: 'Parcelas',
  quantidade: 'Quantidade', dia: 'Dia', vencimento: 'Vencimento', primeiro: 'Primeiro', data: 'Data',
  assinatura: 'Assinatura', forma: 'Forma', pagamento: 'Pagamento', dados: 'Dados', multa: 'Multa',
  atraso: 'Atraso', percentual: 'Percentual', juros: 'Juros', mora: 'Mora', indice: 'Índice',
  correcao: 'Correção', rescisao: 'Rescisão', desistencia: 'Desistência', imobiliaria: 'Imobiliária',
  creci: 'CRECI', corretor: 'Corretor(a)', testemunha: 'Testemunha', testemunhas: 'Testemunhas',
  vias: 'Vias', atual: 'Atual',
}

const fieldGroups: Record<string, string> = {
  vendedor: 'Vendedor',
  comprador: 'Comprador',
  anuente: 'Partes adicionais',
  locador: 'Locador',
  locatario: 'Locatário',
  imovel: 'Imóvel',
  valor: 'Valores',
  quantidade: 'Valores',
  dia: 'Valores',
  multa: 'Penalidades',
  juros: 'Penalidades',
  indice: 'Penalidades',
  prazo: 'Prazos',
  forma: 'Pagamento',
  dados: 'Pagamento',
  pagamento: 'Pagamento',
  situacao: 'Imóvel e situação',
  imobiliaria: 'Imobiliária e corretagem',
  corretor: 'Imobiliária e corretagem',
  testemunha: 'Assinaturas',
  data: 'Vigência',
  garantia: 'Valores',
  concessionaria: 'Imóvel',
  observacoes: 'Observações',
}

export function extractPlaceholders(content: string) {
  const found = new Set<string>()
  for (const match of content.matchAll(placeholderPattern)) found.add(match[1])
  return [...found]
}

export function getFieldLabel(key: string) {
  const normalizedKey = key.replace(/^opcional_/, '')
  const label = fieldLabels[normalizedKey] ?? normalizedKey.split('_').map((word, index) => {
    const translated = fieldWords[word] ?? word
    return index === 0 || translated.toLocaleUpperCase('pt-BR') === translated ? translated : translated.charAt(0).toLocaleLowerCase('pt-BR') + translated.slice(1)
  }).join(' ')
  return key.startsWith('opcional_') ? `${label} (opcional)` : label
}

export function getFieldGroup(key: string) {
  const prefix = key.replace(/^opcional_/, '').split('_')[0]
  return fieldGroups[prefix] ?? 'Informações adicionais'
}

export function getFieldType(key: string): 'date' | 'tel' | 'currency' | 'postal' | 'textarea' | 'text' {
  const normalizedKey = key.replace(/^opcional_/, '')
  if (/_extenso$/i.test(normalizedKey)) return 'text'
  if (/(^data_|_data$|_date$)/i.test(normalizedKey)) return 'date'
  if (/cep|postal/i.test(normalizedKey)) return 'postal'
  if (/(^valor_|aluguel|condominio|preco|price)/i.test(normalizedKey)) return 'currency'
  if (/(telefone|phone|celular)/i.test(normalizedKey)) return 'tel'
  if (/(descricao|dados|situacao_|partes_adicionais)/i.test(normalizedKey)) return 'textarea'
  return 'text'
}

export function renderTemplate(content: string, values: Record<string, string>) {
  return content.replace(placeholderPattern, (_match, key: string) => values[key] || (key.startsWith('opcional_') ? '' : `{{${key}}}`))
}

export function formatTemplateValue(key: string, value: string) {
  if (getFieldType(key) !== 'date' || !value) return value
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}