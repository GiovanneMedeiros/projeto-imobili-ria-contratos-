import type { ContractTemplate } from '../types/domain'

const content = `Modelo baseado no arquivo Word oficial da Imobiliária Miellis. A geração utiliza o DOCX original e substitui os dados da venda para preservar cabeçalho, tabelas, fontes e diagramação.`

export const OFFICIAL_SALE_TEMPLATE: ContractTemplate = {
  id: 'miellis-official-sale-promise',
  versionId: 'miellis-official-sale-promise-v1',
  name: 'Promessa de Compra e Venda de Imóvel — Miellis',
  type: 'Compra e venda',
  version: '1.0',
  status: 'active',
  content,
  demonstration: false,
  versionHistory: [{ id: 'miellis-official-sale-promise-v1', version: '1.0', content, createdAt: '2026-09-28T12:00:00.000Z' }],
}
