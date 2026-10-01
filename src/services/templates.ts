import { DEMO_TEMPLATE } from '../data/demo'
import { OFFICIAL_SALE_TEMPLATE } from '../data/officialSaleTemplate'
import { extractPlaceholders } from '../lib/placeholders'
import { demoMode, supabase } from '../lib/supabase'
import type { ContractTemplate, ContractTemplateField } from '../types/domain'

const DEMO_TEMPLATES_KEY = 'miellis-demo-templates-v1'
const templatePdfCache = new Map<string, Promise<Uint8Array>>()
const templateDocxCache = new Map<string, Promise<Uint8Array>>()

function getDemoTemplates(): ContractTemplate[] {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_TEMPLATES_KEY) ?? '[]') as ContractTemplate[]
    const defaults = [OFFICIAL_SALE_TEMPLATE, DEMO_TEMPLATE]
    return [
      ...defaults.map((template) => saved.find((item) => item.id === template.id) ?? template),
      ...saved.filter((item) => !defaults.some((template) => template.id === item.id)),
    ]
  } catch {
    return [OFFICIAL_SALE_TEMPLATE, DEMO_TEMPLATE]
  }
}

async function encodeDemoFile(file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error('No modo demonstração, importe arquivos de até 2 MB. Configure o Supabase para armazenar arquivos maiores.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let encoded = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    encoded += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(encoded)
}

export async function getTemplatePdfBytes(template: ContractTemplate) {
  const cacheKey = template.versionId ?? template.id
  let request = templatePdfCache.get(cacheKey)
  if (!request) {
    request = (async () => {
      if (template.sourcePdfData) {
        const decoded = atob(template.sourcePdfData)
        return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
      }
      if (!template.sourcePdfPath || !supabase) throw new Error('O PDF original deste modelo não está disponível.')
      const { data, error } = await supabase.storage.from('contract-template-pdfs').download(template.sourcePdfPath)
      if (error) throw error
      return new Uint8Array(await data.arrayBuffer())
    })()
    templatePdfCache.set(cacheKey, request)
    void request.catch(() => templatePdfCache.delete(cacheKey))
  }
  return (await request).slice()
}

export async function getTemplateDocxBytes(template: ContractTemplate) {
  const cacheKey = template.versionId ?? template.id
  let request = templateDocxCache.get(cacheKey)
  if (!request) {
    request = (async () => {
      if (template.sourceDocxData) {
        const decoded = atob(template.sourceDocxData)
        return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
      }
      if (!template.sourceDocxPath || !supabase) throw new Error('O arquivo Word original deste modelo não está disponível.')
      const { data, error } = await supabase.storage.from('contract-template-pdfs').download(template.sourceDocxPath)
      if (error) throw error
      return new Uint8Array(await data.arrayBuffer())
    })()
    templateDocxCache.set(cacheKey, request)
    void request.catch(() => templateDocxCache.delete(cacheKey))
  }
  return (await request).slice()
}

export async function listTemplates(includeInactive = false): Promise<ContractTemplate[]> {
  if (demoMode) return getDemoTemplates().filter((template) => includeInactive || template.status === 'active')
  if (!supabase) return []
  let query = supabase
    .from('contract_templates')
    .select('id, name, type, status, contract_template_versions(id, version, content, source_pdf_path, source_docx_path, pdf_fields, created_at)')
    .order('name')
  if (!includeInactive) query = query.eq('status', 'active')
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const versions = (row.contract_template_versions as { id: string; version: string; content: string; source_pdf_path: string | null; source_docx_path: string | null; pdf_fields: ContractTemplateField[] | null; created_at: string }[]).sort((left, right) => right.created_at.localeCompare(left.created_at))
    const current = versions[0]
    return current ? [{ id: row.id, versionId: current.id, name: row.name, type: row.type, status: row.status, version: current.version, content: current.content, sourcePdfPath: current.source_pdf_path ?? undefined, sourceDocxPath: current.source_docx_path ?? undefined, pdfFields: current.pdf_fields ?? [], demonstration: false, versionHistory: [...versions].reverse().map((version) => ({ id: version.id, version: version.version, content: version.content, sourcePdfPath: version.source_pdf_path ?? undefined, sourceDocxPath: version.source_docx_path ?? undefined, pdfFields: version.pdf_fields ?? [], createdAt: version.created_at })) }] : []
  })
}

export async function createTemplate(input: { name: string; type: string; content: string; sourcePdf?: File | null; sourceDocx?: File | null; pdfFields?: ContractTemplateField[] }, userId: string) {
  const versionId = crypto.randomUUID()
  const sourcePdfData = demoMode && input.sourcePdf ? await encodeDemoFile(input.sourcePdf) : undefined
  const sourceDocxData = demoMode && input.sourceDocx ? await encodeDemoFile(input.sourceDocx) : undefined
  const template: ContractTemplate = {
    id: crypto.randomUUID(),
    versionId,
    name: input.name.trim(),
    type: input.type.trim(),
    version: '1.0',
    status: 'active',
    content: input.content,
    sourcePdfData,
    sourceDocxData,
    pdfFields: input.pdfFields ?? [],
    demonstration: demoMode,
    versionHistory: [{ id: versionId, version: '1.0', content: input.content, createdAt: new Date().toISOString() }],
  }
  const fields = extractPlaceholders(input.content)

  if (demoMode) {
    const templates = getDemoTemplates().filter((item) => item.id !== DEMO_TEMPLATE.id)
    localStorage.setItem(DEMO_TEMPLATES_KEY, JSON.stringify([...templates, template]))
    return template
  }
  if (!supabase) throw new Error('Configure o Supabase antes de cadastrar um modelo.')

  const { data: created, error: createError } = await supabase
    .from('contract_templates')
    .insert({ name: template.name, type: template.type, status: 'active', created_by: userId })
    .select('id')
    .single()
  if (createError) throw createError

  const sourcePdfPath = input.sourcePdf ? `${userId}/${created.id}/${versionId}.pdf` : undefined
  const sourceDocxPath = input.sourceDocx ? `${userId}/${created.id}/${versionId}.docx` : undefined
  if (input.sourcePdf && sourcePdfPath) {
    const { error: uploadError } = await supabase.storage.from('contract-template-pdfs').upload(sourcePdfPath, input.sourcePdf, { contentType: 'application/pdf', upsert: false })
    if (uploadError) throw uploadError
  }
  if (input.sourceDocx && sourceDocxPath) {
    const { error: uploadError } = await supabase.storage.from('contract-template-pdfs').upload(sourceDocxPath, input.sourceDocx, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false })
    if (uploadError) throw uploadError
  }

  const { data: version, error: versionError } = await supabase.from('contract_template_versions').insert({
    template_id: created.id,
    version: template.version,
    content: template.content,
    placeholders: fields,
    source_pdf_path: sourcePdfPath,
    source_docx_path: sourceDocxPath,
    pdf_fields: template.pdfFields,
    created_by: userId,
  }).select('id').single()
  if (versionError) throw versionError
  await supabase.from('audit_logs').insert({ user_id: userId, action: 'template.created', entity_type: 'contract_template', entity_id: created.id })
  return { ...template, id: created.id, versionId: version.id, sourcePdfPath, sourceDocxPath }
}

export async function updateTemplate(templateId: string, input: { name: string; type: string; content: string; sourcePdf?: File | null; sourceDocx?: File | null; pdfFields?: ContractTemplateField[] }, userId: string) {
  const currentTemplates = await listTemplates(true)
  const current = currentTemplates.find((item) => item.id === templateId)
  if (!current) throw new Error('O modelo selecionado não foi encontrado.')
  const [major, minor] = current.version.split('.').map(Number)
  const nextVersion = `${major}.${minor + 1}`
  const createdAt = new Date().toISOString()
  const newVersionId = crypto.randomUUID()

  if (demoMode) {
    const sourcePdfData = input.sourcePdf ? await encodeDemoFile(input.sourcePdf) : input.sourceDocx ? undefined : current.sourcePdfData
    const sourceDocxData = input.sourceDocx ? await encodeDemoFile(input.sourceDocx) : input.sourcePdf ? undefined : current.sourceDocxData
    const updated: ContractTemplate = {
      ...current,
      name: input.name.trim(),
      type: input.type.trim(),
      content: input.content,
      sourcePdfData,
      sourceDocxData,
      pdfFields: input.pdfFields ?? current.pdfFields ?? [],
      version: nextVersion,
      versionId: newVersionId,
      sourcePdfPath: input.sourceDocx ? undefined : current.sourcePdfPath,
      sourceDocxPath: input.sourcePdf ? undefined : current.sourceDocxPath,
      versionHistory: [...(current.versionHistory ?? []), { id: newVersionId, version: nextVersion, content: input.content, sourcePdfPath: input.sourceDocx ? undefined : current.sourcePdfPath, sourceDocxPath: input.sourcePdf ? undefined : current.sourceDocxPath, pdfFields: input.pdfFields ?? current.pdfFields ?? [], createdAt }],
    }
    localStorage.setItem(DEMO_TEMPLATES_KEY, JSON.stringify([...currentTemplates.filter((item) => item.id !== templateId), updated]))
    return updated
  }
  if (!supabase) throw new Error('Configure o Supabase antes de editar modelos.')
  const { error: updateError } = await supabase.from('contract_templates').update({ name: input.name.trim(), type: input.type.trim() }).eq('id', templateId)
  if (updateError) throw updateError
  const sourcePdfPath = input.sourcePdf ? `${userId}/${templateId}/${newVersionId}.pdf` : input.sourceDocx ? undefined : current.sourcePdfPath
  const sourceDocxPath = input.sourceDocx ? `${userId}/${templateId}/${newVersionId}.docx` : input.sourcePdf ? undefined : current.sourceDocxPath
  if (input.sourcePdf && sourcePdfPath) {
    const { error: uploadError } = await supabase.storage.from('contract-template-pdfs').upload(sourcePdfPath, input.sourcePdf, { contentType: 'application/pdf', upsert: false })
    if (uploadError) throw uploadError
  }
  if (input.sourceDocx && sourceDocxPath) {
    const { error: uploadError } = await supabase.storage.from('contract-template-pdfs').upload(sourceDocxPath, input.sourceDocx, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false })
    if (uploadError) throw uploadError
  }
  const { data: version, error: versionError } = await supabase.from('contract_template_versions').insert({ template_id: templateId, version: nextVersion, content: input.content, source_pdf_path: sourcePdfPath ?? null, source_docx_path: sourceDocxPath ?? null, pdf_fields: input.pdfFields ?? [], placeholders: extractPlaceholders(input.content), created_by: userId }).select('id').single()
  if (versionError) throw versionError
  await supabase.from('audit_logs').insert({ user_id: userId, action: 'template.updated', entity_type: 'contract_template', entity_id: templateId, metadata: { version: nextVersion } })
  return { ...current, ...input, version: nextVersion, versionId: version.id, sourcePdfPath, sourceDocxPath, pdfFields: input.pdfFields ?? [] }
}

export async function setTemplateStatus(templateId: string, status: 'active' | 'inactive', userId: string) {
  if (demoMode) {
    const templates = getDemoTemplates().map((item) => item.id === templateId ? { ...item, status } : item)
    localStorage.setItem(DEMO_TEMPLATES_KEY, JSON.stringify(templates))
    return
  }
  if (!supabase) throw new Error('Configure o Supabase antes de alterar modelos.')
  const { error } = await supabase.from('contract_templates').update({ status }).eq('id', templateId)
  if (error) throw error
  await supabase.from('audit_logs').insert({ user_id: userId, action: status === 'active' ? 'template.activated' : 'template.deactivated', entity_type: 'contract_template', entity_id: templateId })
}