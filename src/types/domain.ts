export type UserRole = 'admin' | 'broker'
export type ContractStatusValue = 'draft' | 'in_review' | 'pending_approval' | 'approved' | 'generated' | 'pending_signature' | 'signed' | 'cancelled'
export type ContractStatusDisplay = 'Rascunho' | 'Em revisão' | 'Aguardando aprovação' | 'Aprovado' | 'Gerado' | 'Aguardando assinatura' | 'Assinado' | 'Cancelado'

export const CONTRACT_STATUS_LABELS: Record<ContractStatusValue, ContractStatusDisplay> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  generated: 'Gerado',
  pending_signature: 'Aguardando assinatura',
  signed: 'Assinado',
  cancelled: 'Cancelado',
}

export interface AppUser {
  id: string
  email: string
  fullName: string
  role: UserRole
}

export interface ContractTemplate {
  id: string
  versionId?: string
  name: string
  type: string
  version: string
  status: 'active' | 'inactive'
  content: string
  sourcePdfPath?: string
  sourcePdfData?: string
  pdfFields?: ContractTemplateField[]
  demonstration: boolean
  versionHistory?: { id: string; version: string; content: string; createdAt: string; sourcePdfPath?: string; pdfFields?: ContractTemplateField[] }[]
}

export interface ContractTemplateField {
  key: string
  label: string
  page: number
  x: number
  y: number
  width: number
}

export interface Client {
  id: string
  name: string
  document: string
  phone: string
  email: string
  address: string
  notes?: string
}

export interface Property {
  id: string
  code: string
  address: string
  city: string
  state: string
  kind: string
  number?: string
  complement?: string
  neighborhood?: string
  postalCode?: string
  area?: number
  bedrooms?: number
  bathrooms?: number
  ownerId?: string
  notes?: string
}

export interface ContractDraft {
  id: string
  title: string
  templateId: string
  clientId: string
  propertyId: string
  values: Record<string, string>
  userId: string
  status: ContractStatusValue
  createdAt: string
  updatedAt: string
  percentComplete: number
  templateName?: string
  clientName?: string
  propertyAddress?: string
}

export interface ContractRecord {
  id: string
  title: string
  templateName: string
  clientName: string
  propertyAddress: string
  createdBy: string
  createdAt: string
  status: 'Gerado' | 'Em revisão' | 'Assinado' | 'Rascunho' | 'Aguardando aprovação' | 'Aprovado' | 'Aguardando assinatura' | 'Cancelado'
  fileName?: string
  pdfPath?: string
  templateId?: string
  clientId?: string
  propertyId?: string
  fields?: Record<string, string>
}

export interface ContractReviewIssue {
  id: string
  message: string
  severity: 'warning' | 'error'
  step?: string
  field?: string
}

export interface ContractEvent {
  id: string
  contractId: string
  userId: string
  userName: string
  type: string
  action: string
  message: string
  createdAt: string
  metadata?: Record<string, string>
}