import { AlertCircle, ArrowRight, Check, FileText, Info, LoaderCircle, UserRound, Building2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ClientEditor, PropertyEditor } from './RecordsPages'
import { createAndDownloadContract } from '../services/contracts'
import { listClients, listProperties } from '../services/records'
import { listTemplates } from '../services/templates'
import { formatTemplateValue, getFieldGroup, getFieldLabel, getFieldType, extractPlaceholders, renderTemplate } from '../lib/placeholders'
import { formatCurrency, formatDocument, formatPhone, formatPostalCode, formatPropertyAddress, validateContractFields } from '../utils/format'
import type { Client, ContractRecord, ContractTemplate, Property } from '../types/domain'

const sectionOrder = ['Locador', 'Locatário', 'Imóvel', 'Valores', 'Vigência', 'Observações', 'Informações adicionais']

export function NewContractPage() {
  const { user } = useAuth()
  const location = useLocation()
  const duplicateContract = (location.state as { duplicateContract?: ContractRecord } | null)?.duplicateContract
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [templateId, setTemplateId] = useState('')
  const [clientId, setClientId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [success, setSuccess] = useState('')
  const [clientEditorOpen, setClientEditorOpen] = useState(false)
  const [propertyEditorOpen, setPropertyEditorOpen] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([listTemplates(), listClients(), listProperties()]).then(([modelList, clientList, propertyList]) => {
      if (!active) return
      setTemplates(modelList)
      setClients(clientList)
      setProperties(propertyList)
      const selectedTemplate = modelList.find((item) => item.id === duplicateContract?.templateId || item.name === duplicateContract?.templateName)
      setTemplateId(selectedTemplate?.id ?? modelList[0]?.id ?? '')
      if (duplicateContract) {
        setClientId(duplicateContract.clientId ?? '')
        setPropertyId(duplicateContract.propertyId ?? '')
        setValues(duplicateContract.fields ?? {})
      }
    }).catch(() => {
      if (active) setLoadError('Não foi possível carregar os modelos e cadastros. Tente novamente ou fale com o administrador.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const template = templates.find((item) => item.id === templateId)
  const fields = useMemo(() => template ? extractPlaceholders(template.content) : [], [template])
  const groupedFields = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const field of fields) {
      const group = getFieldGroup(field)
      groups.set(group, [...(groups.get(group) ?? []), field])
    }
    return [...groups.entries()].sort(([left], [right]) => sectionOrder.indexOf(left) - sectionOrder.indexOf(right))
  }, [fields])
  const renderedContent = template ? renderTemplate(template.content, Object.fromEntries(fields.map((field) => [field, formatTemplateValue(field, values[field] ?? '')]))) : ''
  const missingCount = fields.filter((field) => !values[field]?.trim()).length

  function selectTemplate(id: string) {
    setTemplateId(id)
    setValues({})
    setValidationError('')
    setSuccess('')
  }

  function updateValue(key: string, rawValue: string) {
    const kind = getFieldType(key)
    const value = /cpf|cnpj/i.test(key) ? formatDocument(rawValue)
      : kind === 'tel' ? formatPhone(rawValue)
        : kind === 'currency' ? formatCurrency(rawValue)
          : kind === 'postal' ? formatPostalCode(rawValue)
            : rawValue
    setValues((current) => ({ ...current, [key]: value }))
    setValidationError('')
    setSuccess('')
  }

  function selectClient(id: string) {
    setClientId(id)
    const client = clients.find((item) => item.id === id)
    if (!client) return
    setValues((current) => ({
      ...current,
      ...(fields.includes('locatario_nome') ? { locatario_nome: client.name } : {}),
      ...(fields.includes('locatario_cpf') ? { locatario_cpf: client.document } : {}),
      ...(fields.includes('locatario_telefone') ? { locatario_telefone: client.phone } : {}),
      ...(fields.includes('locatario_email') ? { locatario_email: client.email } : {}),
    }))
  }

  function selectProperty(id: string) {
    setPropertyId(id)
    const property = properties.find((item) => item.id === id)
    if (!property) return
    setValues((current) => ({
      ...current,
      ...(fields.includes('imovel_endereco') ? { imovel_endereco: formatPropertyAddress(property) } : {}),
      ...(fields.includes('imovel_cidade') ? { imovel_cidade: property.city } : {}),
      ...(fields.includes('imovel_estado') ? { imovel_estado: property.state } : {}),
      ...(fields.includes('imovel_codigo') ? { imovel_codigo: property.code } : {}),
    }))
  }

  async function generate() {
    setValidationError('')
    setSuccess('')
    if (!template) return setValidationError('Escolha um modelo antes de continuar.')
    if (!clientId) return setValidationError('Selecione um cliente antes de gerar o contrato.')
    if (!propertyId) return setValidationError('Selecione um imóvel antes de gerar o contrato.')
    const fieldError = validateContractFields(fields, values)
    if (fieldError) return setValidationError(fieldError)
    setBusy(true)
    try {
      const result = await createAndDownloadContract({
        template,
        clientId,
        propertyId,
        values,
        renderedContent,
        userId: user?.id ?? '',
      })
      setSuccess(`PDF ${result.fileName} gerado e baixado.`)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="route-loading" role="status">Carregando dados do contrato...</div>

  return (
    <div className="contract-editor-page">
      <section className="page-heading-row editor-heading">
        <div>
          <span className="section-overline">DOCUMENTOS · NOVO</span>
          <h1>Novo contrato</h1>
          <p>Selecione a versão aprovada e preencha apenas os campos do documento.</p>
        </div>
        <Link className="outline-button back-link" to="/contratos"><ArrowRight size={15} />Voltar aos contratos</Link>
      </section>

      {loadError && <div className="inline-alert" role="alert">{loadError}</div>}
      {!loadError && templates.length === 0 && (
        <div className="empty-model-state"><FileText size={23} /><div><strong>Nenhum modelo ativo</strong><p>Cadastre o documento aprovado pela Miellis antes de iniciar um contrato.</p></div>{user?.role === 'admin' && <Link className="gold-button" to="/modelos/novo">Cadastrar modelo</Link>}</div>
      )}

      {templates.length > 0 && (
        <div className="contract-editor-grid">
          <section className="contract-form-panel">
            <div className="editor-section-head"><div><span className="section-overline">01 · MODELO</span><h2>Documento base</h2></div></div>
            <label className="editor-field">Modelo de contrato
              <select value={templateId} onChange={(event) => selectTemplate(event.target.value)}>
                {templates.map((item) => <option value={item.id} key={item.id}>{item.name} · v{item.version}{item.demonstration ? ' · DEMONSTRAÇÃO' : ''}</option>)}
              </select>
            </label>
            {template?.demonstration && <div className="template-demo-alert"><Info size={15} /><span>Este modelo é apenas uma demonstração técnica. Não contém cláusulas jurídicas e não deve ser assinado.</span></div>}

            <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">02 · REFERÊNCIAS</span><h2>Cliente e imóvel</h2></div></div>
            <div className="reference-grid">
              <div className="reference-select"><label className="editor-field"><span className="field-label-with-icon"><UserRound size={14} />Cliente</span>
                  <select value={clientId} onChange={(event) => selectClient(event.target.value)} required>
                    <option value="">Selecionar cliente</option>
                    {clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label><button className="inline-create-link" type="button" onClick={() => setClientEditorOpen(true)}>+ Novo cliente</button></div>
              <div className="reference-select"><label className="editor-field"><span className="field-label-with-icon"><Building2 size={14} />Imóvel</span>
                  <select value={propertyId} onChange={(event) => selectProperty(event.target.value)} required>
                    <option value="">Selecionar imóvel</option>
                    {properties.map((item) => <option value={item.id} key={item.id}>{item.code} · {formatPropertyAddress(item)}</option>)}
                  </select>
                </label><button className="inline-create-link" type="button" onClick={() => setPropertyEditorOpen(true)}>+ Novo imóvel</button></div>
            </div>
            {(clients.length === 0 || properties.length === 0) && <p className="empty-reference-note">Cadastre clientes e imóveis antes de gerar documentos reais.</p>}

            <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">03 · CAMPOS DO MODELO</span><h2>Dados do contrato</h2></div><span className="field-count">{fields.length} campos</span></div>
            {groupedFields.map(([group, groupFields]) => (
              <fieldset className="dynamic-fieldset" key={group}>
                <legend>{group}</legend>
                <div className="dynamic-field-grid">
                  {groupFields.map((field) => {
                    const kind = getFieldType(field)
                    return (
                      <label className={`editor-field${kind === 'text' && field.endsWith('_nome') || field.endsWith('_endereco') || field === 'observacoes' ? ' field-wide' : ''}`} key={field}>
                        {getFieldLabel(field)}<span className="required-star">*</span>
                        <span className={`dynamic-input${kind === 'currency' ? ' currency-input' : ''}`}>
                          {kind === 'currency' && <span>R$</span>}
                          <input
                            type={kind === 'date' ? 'date' : kind === 'tel' ? 'tel' : 'text'}
                            inputMode={kind === 'currency' || /cpf|cnpj|cep/i.test(field) ? 'numeric' : 'text'}
                            value={values[field] ?? ''}
                            onChange={(event) => updateValue(field, event.target.value)}
                            placeholder={kind === 'currency' ? '0,00' : kind === 'date' ? 'dd/mm/aaaa' : getFieldLabel(field)}
                            required
                          />
                        </span>
                        <span className="field-technical-name">{`{{${field}}}`}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            {fields.length === 0 && <p className="empty-reference-note">Este modelo não possui campos entre chaves no formato {'{{campo}}'}.</p>}
            {validationError && <div className="inline-alert" role="alert"><AlertCircle size={15} />{validationError}</div>}
            {success && <div className="success-alert" role="status"><Check size={15} />{success}</div>}
            <div className="editor-actions">
              <span>{missingCount > 0 ? `${missingCount} campos pendentes` : 'Campos preenchidos'}</span>
              <button className="gold-button" type="button" onClick={() => void generate()} disabled={busy || !template || clients.length === 0 || properties.length === 0}>
                {busy ? <LoaderCircle className="spin-icon" size={16} /> : <FileText size={16} />}
                {busy ? 'Gerando PDF...' : 'Gerar PDF'}
              </button>
            </div>
          </section>

          <section className="preview-panel" aria-label="Pré-visualização do contrato">
            <div className="preview-panel-head"><div><span className="section-overline">PRÉVIA AO VIVO</span><h2>{template?.name ?? 'Documento'}</h2></div><span className="paper-size">A4 · v{template?.version}</span></div>
            <article className="contract-paper">
              {template?.demonstration && <div className="paper-demo-stamp">DEMONSTRAÇÃO TÉCNICA · SEM VALIDADE JURÍDICA</div>}
              <pre>{renderedContent || 'Selecione um modelo para visualizar seu conteúdo.'}</pre>
            </article>
            <p className="preview-footnote">A prévia preserva o texto do modelo. Somente placeholders são substituídos pelos dados informados.</p>
          </section>
        </div>
      )}
      {clientEditorOpen && <ClientEditor onClose={() => setClientEditorOpen(false)} onSaved={(client) => {
        setClients((current) => [client, ...current.filter((item) => item.id !== client.id)])
        setClientId(client.id)
        setValues((current) => ({ ...current, ...(fields.includes('locatario_nome') ? { locatario_nome: client.name } : {}), ...(fields.includes('locatario_cpf') ? { locatario_cpf: client.document } : {}), ...(fields.includes('locatario_telefone') ? { locatario_telefone: client.phone } : {}), ...(fields.includes('locatario_email') ? { locatario_email: client.email } : {}) }))
        setClientEditorOpen(false)
      }} />}
      {propertyEditorOpen && <PropertyEditor clients={clients} onClose={() => setPropertyEditorOpen(false)} onSaved={(property) => {
        setProperties((current) => [property, ...current.filter((item) => item.id !== property.id)])
        setPropertyId(property.id)
        setValues((current) => ({ ...current, ...(fields.includes('imovel_endereco') ? { imovel_endereco: formatPropertyAddress(property) } : {}), ...(fields.includes('imovel_cidade') ? { imovel_cidade: property.city } : {}), ...(fields.includes('imovel_estado') ? { imovel_estado: property.state } : {}), ...(fields.includes('imovel_codigo') ? { imovel_codigo: property.code } : {}) }))
        setPropertyEditorOpen(false)
      }} />}
    </div>
  )
}