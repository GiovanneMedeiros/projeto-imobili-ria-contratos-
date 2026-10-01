import { createElement } from 'react'
import { DEMO_CONTRACTS, DEMO_TEMPLATE } from '../data/demo'
import { createBlankOfficialDocx, createOfficialDocx, OFFICIAL_DOCX_ID } from '../data/officialDocxTemplate'
import { fillPdfFields, fillPdfPlaceholders } from '../lib/pdf'
import { fillDocxTemplate } from '../lib/docx'
import { extractPlaceholders, formatTemplateValue } from '../lib/placeholders'
import { getTemplateDocxBytes, getTemplatePdfBytes, listTemplates } from './templates'
import { listClients, listProperties } from './records'
import { formatPropertyAddress } from '../utils/format'
import { demoMode, supabase } from '../lib/supabase'
import { CONTRACT_STATUS_LABELS } from '../types/domain'
import type { ContractDraft, ContractRecord, ContractReviewIssue, ContractStatusDisplay, ContractStatusValue, ContractTemplate } from '../types/domain'

const DEMO_HISTORY_KEY = 'miellis-demo-generated-contracts-v1'
const DEMO_DRAFTS_KEY = 'miellis-demo-contract-drafts-v1'

interface SavedDemoContract {
  id: string
  name: string
  templateId: string
  clientId: string
  propertyId: string
  values: Record<string, string>
  createdAt: string
  fileName: string
  content: string
}

export interface CreateContractInput {
  template: ContractTemplate
  clientId: string
  propertyId: string
  values: Record<string, string>
  renderedContent: string
  userId: string
}

export function getContractStatusLabel(status: ContractStatusValue): ContractStatusDisplay {
  return CONTRACT_STATUS_LABELS[status]
}

// Converte o status salvo no banco (inclui estados técnicos como 'generating' e 'pdf_failed') para o rótulo exibido.
export function getContractRecordStatus(status: string): ContractStatusDisplay {
  if (status === 'review') return 'Em revisão'
  return status in CONTRACT_STATUS_LABELS ? CONTRACT_STATUS_LABELS[status as ContractStatusValue] : 'Gerado'
}

export function getContractStatusClass(status: ContractStatusValue): string {
  const classes: Record<ContractStatusValue, string> = {
    draft: 'status-review',
    in_review: 'status-review',
    pending_approval: 'status-generated',
    approved: 'status-generated',
    generated: 'status-generated',
    pending_signature: 'status-generated',
    signed: 'status-signed',
    cancelled: 'status-inactive',
  }
  return classes[status]
}

export function getMissingContractPlaceholders(template: ContractTemplate, values: Record<string, string>) {
  const placeholders = extractPlaceholders(template.content)
  return placeholders.filter((field) => !String(values[field] ?? '').trim())
}

export function isWordTemplate(template: ContractTemplate) {
  return template.id === OFFICIAL_DOCX_ID || Boolean(template.sourceDocxPath || template.sourceDocxData)
}

export async function renderContractDocx(input: Pick<CreateContractInput, 'template' | 'values'>) {
  if (input.template.id === OFFICIAL_DOCX_ID) return createOfficialDocx(input.values)
  if (!input.template.sourceDocxPath && !input.template.sourceDocxData) throw new Error('O arquivo Word original deste modelo não está disponível.')
  return fillDocxTemplate(await getTemplateDocxBytes(input.template), input.values)
}

export function getContractReviewIssues(template: ContractTemplate, values: Record<string, string>, clientId: string, propertyId: string): ContractReviewIssue[] {
  const issues: ContractReviewIssue[] = []
  const placeholders = getMissingContractPlaceholders(template, values)
  placeholders.forEach((field) => {
    issues.push({ id: `placeholder-${field}`, message: `Campo obrigatório não preenchido: ${field}`, severity: 'error', field })
  })

  if (!clientId) issues.push({ id: 'client-missing', message: 'Cliente não selecionado.', severity: 'error', step: 'cliente' })
  if (!propertyId) issues.push({ id: 'property-missing', message: 'Imóvel não selecionado.', severity: 'error', step: 'imovel' })

  const required = extractPlaceholders(template.content)
  if (required.length === 0 && !template.pdfFields?.length) {
    issues.push({ id: 'template-empty', message: 'O template não possui placeholders nem campos PDF configurados.', severity: 'error', step: 'modelo' })
  }

  return issues
}

export async function loadContractDrafts(): Promise<ContractDraft[]> {
  if (demoMode) {
    try {
      return JSON.parse(localStorage.getItem(DEMO_DRAFTS_KEY) ?? '[]') as ContractDraft[]
    } catch {
      return []
    }
  }

  if (!supabase) return []
  const { data, error } = await supabase.from('contract_drafts').select(DRAFT_COLUMNS).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapDraftRow)
}

const DRAFT_COLUMNS = 'id, title, template_id, client_id, property_id, fields, user_id, status, percent_complete, created_at, updated_at, contract_templates(name), clients(name), properties(address, number, complement, neighborhood)'

interface DraftRow {
  id: string
  title: string
  template_id: string | null
  client_id: string | null
  property_id: string | null
  fields: unknown
  user_id: string
  status: string
  percent_complete: number | string
  created_at: string
  updated_at: string
  contract_templates: unknown
  clients: unknown
  properties: unknown
}

function getRelationName(relation: unknown) {
  const value = Array.isArray(relation) ? relation[0] : relation
  return value && typeof value === 'object' && 'name' in value ? String(value.name) : undefined
}

function mapDraftRow(row: DraftRow): ContractDraft {
  return {
    id: row.id,
    title: row.title,
    templateId: row.template_id ?? '',
    clientId: row.client_id ?? '',
    propertyId: row.property_id ?? '',
    values: (row.fields ?? {}) as Record<string, string>,
    userId: row.user_id,
    status: row.status in CONTRACT_STATUS_LABELS ? row.status as ContractStatusValue : 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    percentComplete: Number(row.percent_complete),
    templateName: getRelationName(row.contract_templates),
    clientName: getRelationName(row.clients),
    propertyAddress: row.properties ? getPropertyAddress(row.properties) : undefined,
  }
}

export async function saveContractDraft(draft: ContractDraft) {
  const entry: ContractDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
    percentComplete: Math.max(0, Math.min(100, draft.percentComplete ?? 0)),
  }

  if (demoMode) {
    const saved = JSON.parse(localStorage.getItem(DEMO_DRAFTS_KEY) ?? '[]') as ContractDraft[]
    const next = saved.filter((item) => item.id !== entry.id)
    next.unshift(entry)
    localStorage.setItem(DEMO_DRAFTS_KEY, JSON.stringify(next))
    return entry
  }

  if (!supabase) throw new Error('Configure o Supabase antes de salvar rascunhos.')

  const { data, error } = await supabase.from('contract_drafts').upsert({
    id: entry.id,
    title: entry.title,
    template_id: entry.templateId || null,
    client_id: entry.clientId || null,
    property_id: entry.propertyId || null,
    fields: entry.values,
    user_id: entry.userId,
    status: entry.status,
    percent_complete: entry.percentComplete,
    created_at: entry.createdAt,
  }, { onConflict: 'id' }).select(DRAFT_COLUMNS).single()
  if (error) throw error
  return mapDraftRow(data)
}

export async function getContractDraft(id: string): Promise<ContractDraft | null> {
  if (demoMode || !supabase) {
    const drafts = await loadContractDrafts()
    return drafts.find((draft) => draft.id === id) ?? null
  }
  const { data, error } = await supabase.from('contract_drafts').select(DRAFT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapDraftRow(data) : null
}

export async function deleteContractDraft(id: string) {
  if (demoMode) {
    const saved = JSON.parse(localStorage.getItem(DEMO_DRAFTS_KEY) ?? '[]') as ContractDraft[]
    localStorage.setItem(DEMO_DRAFTS_KEY, JSON.stringify(saved.filter((draft) => draft.id !== id)))
    return
  }

  if (!supabase) return
  const { error } = await supabase.from('contract_drafts').delete().eq('id', id)
  if (error) throw error
}

export async function renderContractPdf(input: Pick<CreateContractInput, 'template' | 'values' | 'renderedContent'>) {
  if (input.template.sourcePdfPath || input.template.sourcePdfData) {
    const source = await getTemplatePdfBytes(input.template)
    const fieldKeys = input.template.pdfFields?.length
      ? [...new Set(input.template.pdfFields.map((field) => field.key))]
      : extractPlaceholders(input.template.content)
    const values = Object.fromEntries(fieldKeys.map((key) => [key, formatTemplateValue(key, input.values[key] ?? '')]))
    const output = input.template.pdfFields?.length
      ? await fillPdfFields(source, input.template.pdfFields, values)
      : await fillPdfPlaceholders(source, values)
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer
    return new Blob([buffer], { type: 'application/pdf' })
  }
  const [{ pdf }, { ContractPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ContractPdf'),
  ])
  return pdf(createElement(ContractPdfDocument, { title: input.template.name, content: input.renderedContent })).toBlob()
}

export async function createAndDownloadContract(input: CreateContractInput) {
  const isWord = isWordTemplate(input.template)
  const blob = isWord ? await renderContractDocx(input) : await renderContractPdf(input)
  const safeName = input.template.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  const fileName = `contrato-${safeName}-${new Date().toISOString().slice(0, 10)}.${isWord ? 'docx' : 'pdf'}`

  if (demoMode) {
    const [clients, properties] = await Promise.all([listClients(), listProperties()])
    const client = clients.find((item) => item.id === input.clientId)
    const property = properties.find((item) => item.id === input.propertyId)
    const id = crypto.randomUUID()
    const saved = JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY) ?? '[]') as SavedDemoContract[]
    saved.unshift({ id, name: input.template.name, templateId: input.template.id, clientId: input.clientId, propertyId: input.propertyId, values: input.values, createdAt: new Date().toISOString(), fileName, content: input.renderedContent })
    localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(saved))
    downloadBlob(blob, fileName)
    return { id, fileName, clientName: client?.name ?? 'Demonstração', propertyAddress: property?.address ?? 'Demonstração' }
  }

  if (!supabase) throw new Error('Configure o Supabase antes de gerar contratos reais.')
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

  const { data: contract, error: contractError } = await supabase.from('contracts').insert({
    template_id: input.template.id,
    template_version_id: input.template.versionId,
    client_id: input.clientId,
    property_id: input.propertyId,
    created_by: authData.user.id,
    status: 'generating',
    fields: input.values,
    rendered_content: input.renderedContent,
  }).select('id').single()
  if (contractError) throw contractError
  await supabase.from('audit_logs').insert({ user_id: authData.user.id, action: 'contract.created', entity_type: 'contract', entity_id: contract.id, metadata: { template_id: input.template.id } })

  const storagePath = `${authData.user.id}/${contract.id}/${fileName}`
  const contentType = isWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'
  const { error: uploadError } = await supabase.storage.from('contract-pdfs').upload(storagePath, blob, { contentType, upsert: false })
  if (uploadError) {
    await supabase.from('contracts').update({ status: 'pdf_failed' }).eq('id', contract.id)
    throw new Error('O contrato foi registrado, mas não foi possível armazenar o documento. Tente gerar novamente.')
  }

  const { error: updateError } = await supabase.from('contracts').update({ status: 'generated', file_name: fileName, pdf_path: storagePath }).eq('id', contract.id)
  if (updateError) throw updateError
  const fieldRows = Object.entries(input.values).map(([field, value]) => ({ contract_id: contract.id, field_key: field, field_value: value }))
  if (fieldRows.length) await supabase.from('contract_fields').insert(fieldRows)
  await supabase.from('audit_logs').insert({ user_id: authData.user.id, action: 'contract.generated', entity_type: 'contract', entity_id: contract.id, metadata: { template_id: input.template.id, file_name: fileName } })

  downloadBlob(blob, fileName)
  return { id: contract.id, fileName, clientName: '', propertyAddress: '' }
}

function getSavedDemoContracts(): SavedDemoContract[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_HISTORY_KEY) ?? '[]') as SavedDemoContract[]
  } catch {
    return []
  }
}

function getPropertyAddress(relation: unknown) {
  const value = Array.isArray(relation) ? relation[0] : relation
  if (!value || typeof value !== 'object' || !('address' in value)) return 'Imóvel'
  return formatPropertyAddress(value as { address: string; number?: string; complement?: string; neighborhood?: string })
}

export async function listContracts() {
  if (demoMode) {
    const [clients, properties] = await Promise.all([listClients(), listProperties()])
    const generated: ContractRecord[] = getSavedDemoContracts().map((item) => ({
      id: item.id,
      title: item.name,
      templateName: item.name,
      clientName: clients.find((client) => client.id === item.clientId)?.name ?? 'Cliente de demonstração',
      propertyAddress: properties.find((property) => property.id === item.propertyId) ? formatPropertyAddress(properties.find((property) => property.id === item.propertyId)!) : 'Imóvel de demonstração',
      createdBy: 'Acesso de demonstração',
      createdAt: item.createdAt,
      status: 'Gerado',
      fileName: item.fileName,
      templateId: item.templateId,
      clientId: item.clientId,
      propertyId: item.propertyId,
      fields: item.values,
    }))
    return [...generated, ...DEMO_CONTRACTS].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }
  if (!supabase) return []
  const { data, error } = await supabase
    .from('contracts')
    .select('id, title, template_id, client_id, property_id, fields, status, created_at, file_name, pdf_path, contract_templates(name), clients(name), properties(address, number, complement, neighborhood), profiles(full_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row): ContractRecord => ({
    id: row.id,
    title: row.title,
    templateName: (row.contract_templates as { name?: string } | null)?.name ?? 'Modelo',
    clientName: (row.clients as { name?: string } | null)?.name ?? 'Cliente',
    propertyAddress: getPropertyAddress(row.properties),
    createdBy: (row.profiles as { full_name?: string } | null)?.full_name ?? 'Equipe Miellis',
    createdAt: row.created_at,
    status: getContractRecordStatus(row.status),
    fileName: row.file_name ?? undefined,
    pdfPath: row.pdf_path ?? undefined,
    templateId: row.template_id,
    clientId: row.client_id,
    propertyId: row.property_id,
    fields: row.fields as Record<string, string>,
  }))
}

export async function getContractDetails(id: string) {
  if (demoMode) {
    const [clients, properties] = await Promise.all([listClients(), listProperties()])
    const saved = getSavedDemoContracts().find((item) => item.id === id)
    if (saved) {
      const property = properties.find((item) => item.id === saved.propertyId)
      return { ...saved, clientName: clients.find((client) => client.id === saved.clientId)?.name ?? 'Cliente de demonstração', propertyAddress: property ? formatPropertyAddress(property) : 'Imóvel de demonstração' }
    }
    const sample = DEMO_CONTRACTS.find((item) => item.id === id)
    return sample ? { ...sample, content: DEMO_TEMPLATE.content, fileName: undefined } : null
  }
  if (!supabase) return null
  const { data, error } = await supabase
    .from('contracts')
    .select('id, title, status, created_at, file_name, pdf_path, fields, rendered_content, template_id, client_id, property_id, contract_templates(name), clients(name), properties(address, number, complement, neighborhood), profiles(full_name)')
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    ...data,
    templateName: (data.contract_templates as { name?: string } | null)?.name ?? 'Modelo',
    clientName: (data.clients as { name?: string } | null)?.name ?? 'Cliente',
    propertyAddress: getPropertyAddress(data.properties),
    createdBy: (data.profiles as { full_name?: string } | null)?.full_name ?? 'Equipe Miellis',
    createdAt: data.created_at,
    fileName: data.file_name ?? undefined,
    content: data.rendered_content,
  }
}

export async function downloadSavedContract(id: string) {
  if (demoMode) {
    const saved = getSavedDemoContracts().find((item) => item.id === id)
    if (!saved) throw new Error('Este registro demonstrativo não possui um arquivo salvo.')
    const template = (await listTemplates(true)).find((item) => item.id === saved.templateId) ?? DEMO_TEMPLATE
    if (isWordTemplate(template)) {
      downloadBlob(await renderContractDocx({ template, values: saved.values }), saved.fileName)
    } else {
      downloadBlob(await renderContractPdf({ template, values: saved.values, renderedContent: saved.content }), saved.fileName)
    }
    return
  }
  if (!supabase) throw new Error('Configure o Supabase para baixar arquivos protegidos.')
  const { data, error } = await supabase.from('contracts').select('pdf_path, file_name').eq('id', id).single()
  if (error || !data?.pdf_path) throw new Error('O documento não está disponível para este contrato.')
  const { data: file, error: fileError } = await supabase.storage.from('contract-pdfs').createSignedUrl(data.pdf_path, 60, { download: data.file_name ?? true })
  if (fileError) throw fileError
  const anchor = document.createElement('a')
  anchor.href = file.signedUrl
  anchor.target = '_blank'
  anchor.rel = 'noreferrer'
  anchor.click()
  const { data: authData } = await supabase.auth.getUser()
  if (authData.user) await supabase.from('audit_logs').insert({ user_id: authData.user.id, action: 'contract.downloaded', entity_type: 'contract', entity_id: id })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadBlankOfficialContract() {
  const blob = await createBlankOfficialDocx()
  downloadBlob(blob, `modelo-em-branco-miellis-${new Date().toISOString().slice(0, 10)}.docx`)
}