import type { Client, ContractRecord, ContractTemplate, Property } from '../types/domain'

const demoTemplateContent = `DEMONSTRAÇÃO TÉCNICA — NÃO É CONTRATO JURÍDICO

Este texto existe somente para testar o reconhecimento de campos e a substituição automática de placeholders. Não contém cláusulas e não deve ser assinado nem utilizado em uma locação real.

LOCADOR: {{locador_nome}}
CPF/CNPJ: {{locador_cpf}}

LOCATÁRIO: {{locatario_nome}}
CPF/CNPJ: {{locatario_cpf}}

IMÓVEL: {{imovel_endereco}}
VALOR: {{valor_aluguel}}
DATA INICIAL: {{data_inicio}}
PRAZO: {{prazo}}`

export const DEMO_TEMPLATE: ContractTemplate = {
  id: 'demo-template-v1',
  versionId: 'demo-template-v1',
  name: 'Modelo de demonstração',
  type: 'Demonstração técnica',
  version: '0.1',
  status: 'active',
  demonstration: true,
  versionHistory: [{ id: 'demo-template-v1', version: '0.1', content: demoTemplateContent, createdAt: '2026-09-27T12:00:00.000Z' }],
  content: demoTemplateContent,
}

export const DEMO_CLIENTS: Client[] = [
  { id: 'demo-client-1', name: 'Cliente Demonstração A', document: '529.982.247-25', phone: '(51) 99999-0001', email: 'cliente.a@example.invalid', address: 'Viamão, RS' },
  { id: 'demo-client-2', name: 'Cliente Demonstração B', document: '111.444.777-35', phone: '(51) 99999-0002', email: 'cliente.b@example.invalid', address: 'Porto Alegre, RS' },
  { id: 'demo-client-3', name: 'Cliente Demonstração C', document: '935.411.347-80', phone: '(51) 99999-0003', email: 'cliente.c@example.invalid', address: 'Alvorada, RS' },
]

export const DEMO_PROPERTIES: Property[] = [
  { id: 'demo-property-1', code: 'DEMO-001', address: 'Endereço de demonstração, 100', city: 'Viamão', state: 'RS', kind: 'Residencial' },
  { id: 'demo-property-2', code: 'DEMO-002', address: 'Endereço de demonstração, 200', city: 'Porto Alegre', state: 'RS', kind: 'Apartamento' },
  { id: 'demo-property-3', code: 'DEMO-003', address: 'Endereço de demonstração, 300', city: 'Alvorada', state: 'RS', kind: 'Comercial' },
]

export const DEMO_CONTRACTS: ContractRecord[] = [
  { id: 'demo-contract-001', title: 'Demonstração #001', templateName: DEMO_TEMPLATE.name, clientName: DEMO_CLIENTS[0].name, propertyAddress: DEMO_PROPERTIES[0].address, createdBy: 'Equipe Miellis (demo)', createdAt: '2026-09-27T13:20:00-03:00', status: 'Gerado' },
  { id: 'demo-contract-002', title: 'Demonstração #002', templateName: DEMO_TEMPLATE.name, clientName: DEMO_CLIENTS[1].name, propertyAddress: DEMO_PROPERTIES[1].address, createdBy: 'Equipe Miellis (demo)', createdAt: '2026-09-26T11:10:00-03:00', status: 'Em revisão' },
  { id: 'demo-contract-003', title: 'Demonstração #003', templateName: DEMO_TEMPLATE.name, clientName: DEMO_CLIENTS[2].name, propertyAddress: DEMO_PROPERTIES[2].address, createdBy: 'Equipe Miellis (demo)', createdAt: '2026-09-24T09:45:00-03:00', status: 'Assinado' },
]

export const DEMO_DASHBOARD_STATS = { contracts: 128, monthContracts: 24, templates: 1, clients: 342 }