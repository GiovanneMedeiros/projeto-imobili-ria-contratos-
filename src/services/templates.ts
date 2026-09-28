import { DEMO_TEMPLATE } from '../data/demo'
import { extractPlaceholders } from '../lib/placeholders'
import { demoMode, supabase } from '../lib/supabase'
import type { ContractTemplate } from '../types/domain'

const DEMO_TEMPLATES_KEY = 'miellis-demo-templates-v1'

function getDemoTemplates(): ContractTemplate[] {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_TEMPLATES_KEY) ?? '[]') as ContractTemplate[]
    return [saved.find((template) => template.id === DEMO_TEMPLATE.id) ?? DEMO_TEMPLATE, ...saved.filter((template) => template.id !== DEMO_TEMPLATE.id)]
  } catch {
    return [DEMO_TEMPLATE]
  }
}

export async function listTemplates(includeInactive = false): Promise<ContractTemplate[]> {
  if (demoMode) return getDemoTemplates().filter((template) => includeInactive || template.status === 'active')
  if (!supabase) return []
  let query = supabase
    .from('contract_templates')
    .select('id, name, type, status, contract_template_versions(id, version, content, created_at)')
    .order('name')
  if (!includeInactive) query = query.eq('status', 'active')
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const versions = (row.contract_template_versions as { id: string; version: string; content: string; created_at: string }[]).sort((left, right) => right.created_at.localeCompare(left.created_at))
    const current = versions[0]
    return current ? [{ id: row.id, versionId: current.id, name: row.name, type: row.type, status: row.status, version: current.version, content: current.content, demonstration: false, versionHistory: [...versions].reverse().map((version) => ({ id: version.id, version: version.version, content: version.content, createdAt: version.created_at })) }] : []
  })
}

export async function createTemplate(input: { name: string; type: string; content: string }, userId: string) {
  const versionId = crypto.randomUUID()
  const template: ContractTemplate = {
    id: crypto.randomUUID(),
    versionId,
    name: input.name.trim(),
    type: input.type.trim(),
    version: '1.0',
    status: 'active',
    content: input.content,
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

  const { data: version, error: versionError } = await supabase.from('contract_template_versions').insert({
    template_id: created.id,
    version: template.version,
    content: template.content,
    placeholders: fields,
    created_by: userId,
  }).select('id').single()
  if (versionError) throw versionError
  await supabase.from('audit_logs').insert({ user_id: userId, action: 'template.created', entity_type: 'contract_template', entity_id: created.id })
  return { ...template, id: created.id, versionId: version.id }
}

export async function updateTemplate(templateId: string, input: { name: string; type: string; content: string }, userId: string) {
  const currentTemplates = await listTemplates(true)
  const current = currentTemplates.find((item) => item.id === templateId)
  if (!current) throw new Error('O modelo selecionado não foi encontrado.')
  const [major, minor] = current.version.split('.').map(Number)
  const nextVersion = `${major}.${minor + 1}`
  const createdAt = new Date().toISOString()

  if (demoMode) {
    const newVersionId = crypto.randomUUID()
    const updated: ContractTemplate = {
      ...current,
      name: input.name.trim(),
      type: input.type.trim(),
      content: input.content,
      version: nextVersion,
      versionId: newVersionId,
      versionHistory: [...(current.versionHistory ?? []), { id: newVersionId, version: nextVersion, content: input.content, createdAt }],
    }
    localStorage.setItem(DEMO_TEMPLATES_KEY, JSON.stringify([...currentTemplates.filter((item) => item.id !== templateId), updated]))
    return updated
  }
  if (!supabase) throw new Error('Configure o Supabase antes de editar modelos.')
  const { error: updateError } = await supabase.from('contract_templates').update({ name: input.name.trim(), type: input.type.trim() }).eq('id', templateId)
  if (updateError) throw updateError
  const { data: version, error: versionError } = await supabase.from('contract_template_versions').insert({ template_id: templateId, version: nextVersion, content: input.content, placeholders: extractPlaceholders(input.content), created_by: userId }).select('id').single()
  if (versionError) throw versionError
  await supabase.from('audit_logs').insert({ user_id: userId, action: 'template.updated', entity_type: 'contract_template', entity_id: templateId, metadata: { version: nextVersion } })
  return { ...current, ...input, version: nextVersion, versionId: version.id }
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