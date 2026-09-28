export type UserRole = 'admin' | 'broker'

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
  demonstration: boolean
  versionHistory?: { id: string; version: string; content: string; createdAt: string }[]
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

export interface ContractRecord {
  id: string
  title: string
  templateName: string
  clientName: string
  propertyAddress: string
  createdBy: string
  createdAt: string
  status: 'Gerado' | 'Em revisão' | 'Assinado'
  fileName?: string
  pdfPath?: string
  templateId?: string
  clientId?: string
  propertyId?: string
  fields?: Record<string, string>
}