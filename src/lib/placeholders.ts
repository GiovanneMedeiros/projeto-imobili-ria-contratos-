const placeholderPattern = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g

const fieldLabels: Record<string, string> = {
  locador_nome: 'Nome completo',
  locador_cpf: 'CPF/CNPJ',
  locador_telefone: 'Telefone',
  locador_email: 'E-mail',
  locatario_nome: 'Nome completo',
  locatario_cpf: 'CPF/CNPJ',
  locatario_telefone: 'Telefone',
  locatario_email: 'E-mail',
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

const fieldGroups: Record<string, string> = {
  locador: 'Locador',
  locatario: 'Locatário',
  imovel: 'Imóvel',
  valor: 'Valores',
  data: 'Vigência',
  prazo: 'Vigência',
  garantia: 'Valores',
  forma: 'Valores',
  observacoes: 'Observações',
}

export function extractPlaceholders(content: string) {
  const found = new Set<string>()
  for (const match of content.matchAll(placeholderPattern)) found.add(match[1])
  return [...found]
}

export function getFieldLabel(key: string) {
  return fieldLabels[key] ?? key.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function getFieldGroup(key: string) {
  const prefix = key.split('_')[0]
  return fieldGroups[prefix] ?? 'Informações adicionais'
}

export function getFieldType(key: string): 'date' | 'tel' | 'currency' | 'postal' | 'text' {
  if (/(^data_|_data$|_date$)/i.test(key)) return 'date'
  if (/cep|postal/i.test(key)) return 'postal'
  if (/(valor|aluguel|condominio|iptu|preco|price)/i.test(key)) return 'currency'
  if (/(telefone|phone|celular)/i.test(key)) return 'tel'
  return 'text'
}

export function renderTemplate(content: string, values: Record<string, string>) {
  return content.replace(placeholderPattern, (_match, key: string) => values[key] || `{{${key}}}`)
}

export function formatTemplateValue(key: string, value: string) {
  if (getFieldType(key) !== 'date' || !value) return value
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}