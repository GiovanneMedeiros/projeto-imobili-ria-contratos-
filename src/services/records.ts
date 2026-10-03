import { DEMO_CLIENTS, DEMO_PROPERTIES } from '../data/demo'
import { demoMode, supabase } from '../lib/supabase'
import type { Client, Property } from '../types/domain'

const DEMO_CLIENTS_KEY = 'miellis-demo-clients-v1'
const DEMO_PROPERTIES_KEY = 'miellis-demo-properties-v1'

function isMissingRegistryNumberColumn(error: { code?: string, message?: string }) {
  const message = error.message?.toLocaleLowerCase('en-US') ?? ''
  return error.code === '42703' || error.code === 'PGRST204' || (message.includes('registry_number') && (message.includes('column') || message.includes('schema cache') || message.includes('does not exist')))
}

function readDemoList<T>(key: string, seed: T[]): T[] {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) as T[] : seed
  } catch {
    return seed
  }
}

export async function listClients(): Promise<Client[]> {
  if (demoMode) return readDemoList(DEMO_CLIENTS_KEY, DEMO_CLIENTS)
  if (!supabase) return []
  const { data, error } = await supabase.from('clients').select('id, name, document, phone, email, address, notes').order('name')
  if (error) throw error
  return data ?? []
}

export async function listProperties(): Promise<Property[]> {
  if (demoMode) return readDemoList(DEMO_PROPERTIES_KEY, DEMO_PROPERTIES)
  if (!supabase) return []
  const { data, error } = await supabase.from('properties').select('id, code, address, number, complement, neighborhood, city, state, postal_code, type, area, bedrooms, bathrooms, owner_id, notes').order('code')
  if (error) throw error
  const { data: registrations, error: registryError } = await supabase.from('properties').select('id, registry_number')
  if (registryError && !isMissingRegistryNumberColumn(registryError)) throw registryError
  const registryById = registryError ? new Map<string, string>() : new Map((registrations ?? []).map((item) => [item.id, item.registry_number ?? '']))
  return (data ?? []).map((property) => ({
    id: property.id,
    code: property.code,
    address: property.address,
    number: property.number,
    complement: property.complement,
    neighborhood: property.neighborhood,
    city: property.city,
    state: property.state,
    postalCode: property.postal_code,
    registryNumber: registryById.get(property.id) ?? '',
    kind: property.type,
    area: property.area ?? undefined,
    bedrooms: property.bedrooms ?? undefined,
    bathrooms: property.bathrooms ?? undefined,
    ownerId: property.owner_id ?? undefined,
    notes: property.notes,
  }))
}

export async function saveClient(input: Omit<Client, 'id'>, userId: string, id?: string) {
  if (demoMode) {
    const clients = readDemoList(DEMO_CLIENTS_KEY, DEMO_CLIENTS)
    const saved = { ...input, id: id ?? crypto.randomUUID() }
    localStorage.setItem(DEMO_CLIENTS_KEY, JSON.stringify(id ? clients.map((client) => client.id === id ? saved : client) : [saved, ...clients]))
    return saved
  }
  if (!supabase) throw new Error('Configure o Supabase antes de cadastrar clientes.')
  const payload = { name: input.name.trim(), document: input.document.replace(/\D/g, ''), phone: input.phone, email: input.email.trim(), address: input.address.trim(), notes: input.notes?.trim() ?? '' }
  const query = id
    ? supabase.from('clients').update(payload).eq('id', id)
    : supabase.from('clients').insert({ ...payload, created_by: userId })
  const { data, error } = await query.select('id, name, document, phone, email, address, notes').single()
  if (error) throw error
  await supabase.from('audit_logs').insert({ user_id: userId, action: id ? 'client.updated' : 'client.created', entity_type: 'client', entity_id: data.id })
  return data
}

export async function saveProperty(input: Omit<Property, 'id'>, userId: string, id?: string) {
  if (demoMode) {
    const properties = readDemoList(DEMO_PROPERTIES_KEY, DEMO_PROPERTIES)
    const saved = { ...input, id: id ?? crypto.randomUUID() }
    localStorage.setItem(DEMO_PROPERTIES_KEY, JSON.stringify(id ? properties.map((property) => property.id === id ? saved : property) : [saved, ...properties]))
    return saved
  }
  if (!supabase) throw new Error('Configure o Supabase antes de cadastrar imóveis.')
  const registryNumber = input.registryNumber?.trim() ?? ''
  const payload = { code: input.code.trim(), address: input.address.trim(), number: input.number?.trim() ?? '', complement: input.complement?.trim() ?? '', neighborhood: input.neighborhood?.trim() ?? '', city: input.city.trim(), state: input.state.trim().toUpperCase(), postal_code: input.postalCode?.replace(/\D/g, '') ?? '', ...(registryNumber ? { registry_number: registryNumber } : {}), type: input.kind, area: input.area ?? null, bedrooms: input.bedrooms ?? null, bathrooms: input.bathrooms ?? null, owner_id: input.ownerId ?? null, notes: input.notes?.trim() ?? '' }
  const query = id
    ? supabase.from('properties').update(payload).eq('id', id)
    : supabase.from('properties').insert({ ...payload, created_by: userId })
  const { data, error } = await query.select('id, code, address, number, complement, neighborhood, city, state, postal_code, type, area, bedrooms, bathrooms, owner_id, notes').single()
  if (error) {
    if (registryNumber && isMissingRegistryNumberColumn(error)) throw new Error('Aplique a migração da matrícula do imóvel no Supabase antes de salvá-la para próximos contratos.')
    throw error
  }
  await supabase.from('audit_logs').insert({ user_id: userId, action: id ? 'property.updated' : 'property.created', entity_type: 'property', entity_id: data.id })
  return { ...data, postalCode: data.postal_code ?? '', registryNumber, kind: data.type, ownerId: data.owner_id ?? undefined }
}