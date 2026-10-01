import { AlertCircle, ArrowLeft, ArrowRight, Check, Download, FileText, Info, LoaderCircle, UserRound, Building2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ClientEditor, PropertyEditor } from './RecordsPages'
import { DocumentImportPanel } from '../components/DocumentImportPanel'
import { createAndDownloadContract, downloadBlankOfficialContract, isWordTemplate, renderContractDocx, renderContractPdf } from '../services/contracts'
import { listClients, listProperties } from '../services/records'
import { getTemplatePdfBytes, listTemplates } from '../services/templates'
import { formatTemplateValue, getFieldGroup, getFieldLabel, getFieldType, extractPlaceholders, renderTemplate } from '../lib/placeholders'
import { formatCurrency, formatDocument, formatPhone, formatPostalCode, formatPropertyAddress, validateContractFields } from '../utils/format'
import { OFFICIAL_DOCX_FIELDS, OFFICIAL_DOCX_ID } from '../data/officialDocxTemplate'
import { inferDocxTemplateFields } from '../lib/docx'
import type { Client, ContractRecord, ContractTemplate, Property } from '../types/domain'

const sectionOrder = ['Locador', 'Locatário', 'Vendedor', 'Comprador', 'Partes adicionais', 'Imóvel', 'Imóvel e situação', 'Valores', 'Pagamento', 'Penalidades', 'Prazos', 'Vigência', 'Imobiliária e corretagem', 'Assinaturas', 'Observações', 'Informações adicionais']
type ContractKind = 'sale' | 'rental'

function getContractKind(template: ContractTemplate): ContractKind | null {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const type = normalize(template.type)
  if (/loca|aluguel|arrendamento/.test(type)) return 'rental'
  if (/compra|venda|promessa/.test(type)) return 'sale'
  const name = normalize(template.name)
  if (/loca|aluguel|arrendamento/.test(name)) return 'rental'
  if (/compra|venda|promessa/.test(name)) return 'sale'
  return null
}

export function NewContractPage() {
  const { user } = useAuth()
  const location = useLocation()
  const duplicateContract = (location.state as { duplicateContract?: ContractRecord } | null)?.duplicateContract
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [contractKind, setContractKind] = useState<ContractKind>('sale')
  const [templateId, setTemplateId] = useState('')
  const [clientId, setClientId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [success, setSuccess] = useState('')
  const [pdfPreview, setPdfPreview] = useState<{ key: string; url?: string; error?: string } | null>(null)
  const [clientEditorOpen, setClientEditorOpen] = useState(false)
  const [propertyEditorOpen, setPropertyEditorOpen] = useState(false)
  const [activeGroupIndex, setActiveGroupIndex] = useState(0)
  const [previewStatus, setPreviewStatus] = useState('Preparando prévia...')
  const previewHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([listTemplates(), listClients(), listProperties()]).then(([modelList, clientList, propertyList]) => {
      if (!active) return
      setTemplates(modelList)
      setClients(clientList)
      setProperties(propertyList)
      const requestedTemplate = modelList.find((item) => item.id === duplicateContract?.templateId || item.name === duplicateContract?.templateName)
      const initialKind = requestedTemplate ? getContractKind(requestedTemplate) ?? 'sale' : getContractKind(modelList[0]) ?? 'sale'
      const selectedTemplate = requestedTemplate && getContractKind(requestedTemplate) === initialKind
        ? requestedTemplate
        : modelList.find((item) => getContractKind(item) === initialKind)
      setContractKind(initialKind)
      setTemplateId(selectedTemplate?.id ?? '')
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
  const compatibleTemplates = templates.filter((item) => getContractKind(item) === contractKind)
  const wordTemplate = template ? isWordTemplate(template) : false
  const fields = useMemo(() => {
    if (!template) return []
    if (template.id === OFFICIAL_DOCX_ID) return [...OFFICIAL_DOCX_FIELDS]
    if (template.pdfFields?.length) return [...new Set(template.pdfFields.map((field) => field.key))]
    const placeholders = extractPlaceholders(template.content)
    return wordTemplate ? [...new Set([...placeholders, ...inferDocxTemplateFields(template.content)])] : placeholders
  }, [template, wordTemplate])
  const fieldLabels = useMemo(() => new Map(template?.pdfFields?.map((field) => [field.key, field.label]) ?? []), [template])
  const groupedFields = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const field of fields) {
      const group = getFieldGroup(field)
      groups.set(group, [...(groups.get(group) ?? []), field])
    }
    return [...groups.entries()].sort(([left], [right]) => {
      const leftOrder = sectionOrder.indexOf(left)
      const rightOrder = sectionOrder.indexOf(right)
      return (leftOrder < 0 ? sectionOrder.length : leftOrder) - (rightOrder < 0 ? sectionOrder.length : rightOrder)
    })
  }, [fields])
  const renderedContent = template ? renderTemplate(template.content, Object.fromEntries(fields.map((field) => [field, formatTemplateValue(field, values[field] ?? '')]))) : ''
  const missingCount = fields.filter((field) => !field.startsWith('opcional_') && !values[field]?.trim()).length
  const currentGroup = groupedFields[activeGroupIndex]
  const currentGroupMissing = currentGroup?.[1].filter((field) => !field.startsWith('opcional_') && !values[field]?.trim()).length ?? 0
  const previewKey = template ? `${template.id}:${template.versionId ?? template.version}:${JSON.stringify(values)}` : ''

  useEffect(() => {
    if (!template?.sourcePdfPath && !template?.sourcePdfData) return
    let active = true
    let previewUrl = ''
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let blob: Blob
          if (missingCount > 0) {
            const source = await getTemplatePdfBytes(template)
            const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer
            blob = new Blob([buffer], { type: 'application/pdf' })
          } else {
            blob = await renderContractPdf({ template, values, renderedContent })
          }
          previewUrl = URL.createObjectURL(blob)
          if (active) setPdfPreview({ key: previewKey, url: previewUrl })
          else URL.revokeObjectURL(previewUrl)
        } catch (error) {
          if (active) setPdfPreview({ key: previewKey, error: error instanceof Error ? error.message : 'Não foi possível atualizar a prévia do PDF.' })
        }
      })()
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [template, previewKey, missingCount, values, renderedContent])

  function selectTemplate(id: string) {
    setTemplateId(id)
    const nextTemplate = templates.find((item) => item.id === id)
    if (nextTemplate) setContractKind(getContractKind(nextTemplate) ?? contractKind)
    setActiveGroupIndex(0)
    setValues({})
    setValidationError('')
    setSuccess('')
  }

  function selectContractKind(kind: ContractKind) {
    setContractKind(kind)
    const nextTemplate = templates.find((item) => getContractKind(item) === kind)
    setTemplateId(nextTemplate?.id ?? '')
    setClientId('')
    setPropertyId('')
    setActiveGroupIndex(0)
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

  function applyExtractedValues(extracted: Record<string, string>, overwrite: boolean) {
    let applied = 0
    for (const [key, value] of Object.entries(extracted)) {
      if (!fields.includes(key) || (!overwrite && values[key]?.trim())) continue
      updateValue(key, value)
      applied += 1
    }
    return applied
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
      ...(fields.includes('comprador_nome') ? { comprador_nome: client.name } : {}),
      ...(fields.includes('comprador_cpf') ? { comprador_cpf: client.document } : {}),
      ...(fields.includes('comprador_telefone') ? { comprador_telefone: client.phone } : {}),
      ...(fields.includes('comprador_email') ? { comprador_email: client.email } : {}),
      ...(fields.includes('comprador_endereco') ? { comprador_endereco: client.address } : {}),
      ...(fields.includes('comprador_cidade') ? { comprador_cidade: client.address.split(',')[0]?.trim() ?? '' } : {}),
    }))
  }

  function selectProperty(id: string) {
    setPropertyId(id)
    const property = properties.find((item) => item.id === id)
    if (!property) return
    const owner = clients.find((item) => item.id === property.ownerId)
    setValues((current) => ({
      ...current,
      ...(owner && fields.includes('locador_nome') ? { locador_nome: owner.name } : {}),
      ...(owner && fields.includes('locador_cpf') ? { locador_cpf: owner.document } : {}),
      ...(owner && fields.includes('locador_telefone') ? { locador_telefone: owner.phone } : {}),
      ...(owner && fields.includes('locador_email') ? { locador_email: owner.email } : {}),
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
      setSuccess(`${isWordTemplate(template) ? 'Word' : 'PDF'} ${result.fileName} gerado e baixado.`)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadBlankTemplate() {
    setValidationError('')
    setSuccess('')
    setBusy(true)
    try {
      await downloadBlankOfficialContract()
      setSuccess('Modelo Word em branco baixado. Preencha as linhas diretamente no Word.')
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Não foi possível baixar o modelo em branco.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!wordTemplate || !template || !previewHostRef.current) return
    let active = true
    let resizeObserver: ResizeObserver | undefined
    const host = previewHostRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        setPreviewStatus('Atualizando prévia...')
        const blank = '________________________'
        const previewValues = Object.fromEntries(fields.map((field) => [field, values[field]?.trim() || blank]))
        try {
          const { renderAsync } = await import('docx-preview')
          const docxBlob = template.id === OFFICIAL_DOCX_ID
            ? await import('../data/officialDocxTemplate').then(({ createOfficialDocx }) => createOfficialDocx(previewValues))
            : await renderContractDocx({ template, values: previewValues })
          if (!active) return
          const pageMount = document.createElement('div')
          const styleMount = document.createElement('div')
          await renderAsync(docxBlob, pageMount, styleMount, {
            className: 'miellis-docx-preview',
            ignoreWidth: false,
            ignoreHeight: true,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
          })
          if (!active) return
          host.replaceChildren(styleMount, pageMount)
          const fitPage = () => {
            const firstPage = pageMount.querySelector<HTMLElement>('.miellis-docx-preview')
            if (!firstPage) return
            const scale = Math.min(1, (host.clientWidth - 26) / firstPage.offsetWidth)
            pageMount.style.setProperty('--docx-preview-zoom', String(scale))
          }
          fitPage()
          resizeObserver = new ResizeObserver(fitPage)
          resizeObserver.observe(host)
          setPreviewStatus('Prévia atualizada')
        } catch {
          if (active) setPreviewStatus('Não foi possível renderizar a prévia. O Word original continua disponível para download.')
        }
      })()
    }, 450)
    return () => {
      active = false
      window.clearTimeout(timer)
      resizeObserver?.disconnect()
    }
  }, [wordTemplate, template, fields, values])

  if (loading) return <div className="route-loading" role="status">Carregando dados do contrato...</div>

  return (
    <div className="contract-editor-page">
      <section className="page-heading-row editor-heading">
        <div>
          <span className="section-overline">DOCUMENTOS · NOVO</span>
          <h1>Novo contrato</h1>
          <p>Escolha o tipo, envie os documentos e confira os dados encontrados.</p>
        </div>
        <Link className="outline-button back-link" to="/contratos"><ArrowRight size={15} />Voltar aos contratos</Link>
      </section>

      {loadError && <div className="inline-alert" role="alert">{loadError}</div>}
      {!loadError && templates.length === 0 && (
        <div className="empty-model-state"><FileText size={23} /><div><strong>Nenhum modelo ativo</strong><p>Cadastre o documento aprovado pela Miellis antes de iniciar um contrato.</p></div>{user?.role === 'admin' && <Link className="gold-button" to="/modelos/novo">Cadastrar modelo</Link>}</div>
      )}

      {templates.length > 0 && (
        <div className={`contract-editor-grid${template ? '' : ' contract-editor-no-template'}`}>
          <section className="contract-form-panel">
            <div className="editor-section-head"><div><span className="section-overline">01 · TIPO</span><h2>O que vamos gerar?</h2></div></div>
            <div className="contract-kind-switch" role="group" aria-label="Tipo de contrato">
              <button className={contractKind === 'sale' ? 'contract-kind-active' : ''} type="button" aria-pressed={contractKind === 'sale'} onClick={() => selectContractKind('sale')}><FileText size={16} />Compra e venda</button>
              <button className={contractKind === 'rental' ? 'contract-kind-active' : ''} type="button" aria-pressed={contractKind === 'rental'} onClick={() => selectContractKind('rental')}><Building2 size={16} />Locação</button>
            </div>
            <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">02 · MODELO</span><h2>Documento base</h2></div></div>
            <label className="editor-field">Modelo de contrato
              <select value={compatibleTemplates.some((item) => item.id === templateId) ? templateId : ''} onChange={(event) => selectTemplate(event.target.value)} disabled={!compatibleTemplates.length}>
                <option value="">{compatibleTemplates.length ? 'Selecionar modelo' : 'Nenhum modelo cadastrado para este tipo'}</option>
                {compatibleTemplates.map((item) => <option value={item.id} key={item.id}>{item.name} · v{item.version}{item.demonstration ? ' · DEMONSTRAÇÃO' : ''}</option>)}
              </select>
            </label>
            {!compatibleTemplates.length && <p className="empty-reference-note">Não há modelo ativo para {contractKind === 'sale' ? 'compra e venda' : 'locação'}. {user?.role === 'admin' ? <Link className="subtle-link" to="/modelos/novo">Cadastrar modelo</Link> : 'Peça ao administrador para cadastrar um modelo desse tipo.'}</p>}
            {template?.demonstration && <div className="template-demo-alert"><Info size={15} /><span>Este modelo é apenas uma demonstração técnica. Não contém cláusulas jurídicas e não deve ser assinado.</span></div>}
            {template?.id === OFFICIAL_DOCX_ID && <div className="template-demo-alert"><Info size={15} /><div><span>Escolha como quer preencher: use o formulário organizado por etapas ou baixe uma cópia em branco para preencher direto no Word. O layout original da Miellis é mantido.</span><button className="outline-button blank-template-button" type="button" onClick={() => void downloadBlankTemplate()} disabled={busy}><Download size={14} />Baixar Word em branco</button></div></div>}

            {template && <>
            <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">03 · REFERÊNCIAS</span><h2>Cliente e imóvel</h2></div></div>
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

            {fields.length > 0 && <>
              <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">04 · LEITURA AUTOMÁTICA</span><h2>Documentos</h2></div></div>
              <DocumentImportPanel key={templateId} fields={fields} values={values} onApply={applyExtractedValues} />
            </>}

            <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">05 · COMPLEMENTO</span><h2>Dados do contrato</h2></div><span className="field-count">{activeGroupIndex + 1} de {groupedFields.length} etapas</span></div>
            <div className="field-stepper" aria-label="Etapas dos dados do contrato">
              {groupedFields.map(([group, groupFields], index) => {
                const pending = groupFields.filter((field) => !field.startsWith('opcional_') && !values[field]?.trim()).length
                return <button className={`field-step${activeGroupIndex === index ? ' field-step-active' : ''}${pending === 0 ? ' field-step-complete' : ''}`} type="button" key={group} onClick={() => setActiveGroupIndex(index)} aria-current={activeGroupIndex === index ? 'step' : undefined}>
                  <span>{pending === 0 ? <Check size={12} /> : index + 1}</span><span>{group}</span>
                </button>
              })}
            </div>
            {currentGroup && (
              <fieldset className="dynamic-fieldset current-fieldset" key={currentGroup[0]}>
                <legend>{currentGroup[0]}</legend>
                <div className="dynamic-field-grid">
                  {currentGroup[1].map((field) => {
                    const kind = getFieldType(field)
                    return (
                      <label className={`editor-field${kind === 'textarea' || field.endsWith('_nome') || field.endsWith('_endereco') || field === 'observacoes' ? ' field-wide' : ''}`} key={field}>
                        {fieldLabels.get(field) ?? getFieldLabel(field)}{!field.startsWith('opcional_') && <span className="required-star">*</span>}
                        {kind === 'textarea' ? <textarea
                          rows={field.includes('descricao') || field.includes('situacao_') ? 4 : 2}
                          value={values[field] ?? ''}
                          onChange={(event) => updateValue(field, event.target.value)}
                          placeholder={fieldLabels.get(field) ?? getFieldLabel(field)}
                          required={!field.startsWith('opcional_')}
                        /> : <span className={`dynamic-input${kind === 'currency' ? ' currency-input' : ''}`}>
                          {kind === 'currency' && <span>R$</span>}
                          <input
                            type={kind === 'date' ? 'date' : kind === 'tel' ? 'tel' : 'text'}
                            inputMode={kind === 'currency' || /cpf|cnpj|cep/i.test(field) ? 'numeric' : 'text'}
                            value={values[field] ?? ''}
                            onChange={(event) => updateValue(field, event.target.value)}
                            placeholder={kind === 'currency' ? '0,00' : kind === 'date' ? 'dd/mm/aaaa' : getFieldLabel(field)}
                            required={!field.startsWith('opcional_')}
                          />
                        </span>}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}
            {groupedFields.length > 1 && <div className="field-step-actions"><button className="outline-button" type="button" disabled={activeGroupIndex === 0} onClick={() => setActiveGroupIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={14} />Anterior</button><span>{currentGroupMissing ? `${currentGroupMissing} para preencher nesta etapa` : 'Etapa preenchida'}</span><button className="outline-button" type="button" disabled={activeGroupIndex >= groupedFields.length - 1} onClick={() => setActiveGroupIndex((index) => Math.min(groupedFields.length - 1, index + 1))}>Próxima<ArrowRight size={14} /></button></div>}
            {fields.length === 0 && <p className="empty-reference-note">Este modelo não possui campos entre chaves no formato {'{{campo}}'}.</p>}
            {validationError && <div className="inline-alert" role="alert"><AlertCircle size={15} />{validationError}</div>}
            {success && <div className="success-alert" role="status"><Check size={15} />{success}</div>}
            <div className="editor-actions">
              <span>{missingCount > 0 ? `${missingCount} campos pendentes` : 'Campos preenchidos'}</span>
              <button className="gold-button" type="button" onClick={() => void generate()} disabled={busy || !template || (template.id !== OFFICIAL_DOCX_ID && (clients.length === 0 || properties.length === 0))}>
                {busy ? <LoaderCircle className="spin-icon" size={16} /> : <FileText size={16} />}
                {busy ? 'Gerando documento...' : wordTemplate ? 'Gerar documento Word' : 'Gerar PDF'}
              </button>
            </div>
            </>}
          </section>

          {template && (wordTemplate ? <section className="preview-panel live-docx-preview-panel" aria-label="Pré-visualização ao vivo do contrato Word">
            <div className="preview-panel-head"><div><span className="section-overline">PRÉVIA AO VIVO</span><h2>{template?.name ?? 'Documento'}</h2></div><span className="paper-size">DOCX original</span></div>
            <div className="docx-preview-status" role="status"><LoaderCircle className={previewStatus.includes('...') ? 'spin-icon' : ''} size={13} />{previewStatus}</div>
            <div className="docx-preview-host" ref={previewHostRef} aria-live="polite" />
            <p className="preview-footnote">A prévia mostra o documento original com os dados preenchidos e linhas nos campos ainda vazios. A paginação final pode variar no Microsoft Word.</p>
          </section> : <section className="preview-panel" aria-label="Pré-visualização do contrato">
            <div className="preview-panel-head"><div><span className="section-overline">PRÉVIA AO VIVO</span><h2>{template?.name ?? 'Documento'}</h2></div><span className="paper-size">A4 · v{template?.version}</span></div>
            {template?.sourcePdfPath || template?.sourcePdfData
              ? pdfPreview?.key === previewKey && pdfPreview.url
                ? <iframe className="template-pdf-viewer" src={pdfPreview.url} title={`Prévia preenchida: ${template.name}`} />
                : pdfPreview?.key === previewKey && pdfPreview.error
                  ? <div className="inline-alert" role="alert">{pdfPreview.error}</div>
                  : <div className="template-pdf-loading">{missingCount ? `PDF original · ${missingCount} campos pendentes` : 'Atualizando prévia...'}</div>
              : <article className="contract-paper">
              {template?.demonstration && <div className="paper-demo-stamp">DEMONSTRAÇÃO TÉCNICA · SEM VALIDADE JURÍDICA</div>}
              <pre>{renderedContent || 'Selecione um modelo para visualizar seu conteúdo.'}</pre>
              </article>}
            <p className="preview-footnote">{template?.sourcePdfPath || template?.sourcePdfData ? 'O PDF mantém a identidade visual original; os campos são substituídos nos locais marcados.' : 'A prévia preserva o texto do modelo. Somente placeholders são substituídos pelos dados informados.'}</p>
          </section>)}
        </div>
      )}
      {clientEditorOpen && <ClientEditor onClose={() => setClientEditorOpen(false)} onSaved={(client) => {
        setClients((current) => [client, ...current.filter((item) => item.id !== client.id)])
        setClientId(client.id)
        setValues((current) => ({ ...current, ...(fields.includes('locatario_nome') ? { locatario_nome: client.name } : {}), ...(fields.includes('locatario_cpf') ? { locatario_cpf: client.document } : {}), ...(fields.includes('locatario_telefone') ? { locatario_telefone: client.phone } : {}), ...(fields.includes('locatario_email') ? { locatario_email: client.email } : {}) }))
        setClientEditorOpen(false)
      }} />}
      {propertyEditorOpen && <PropertyEditor clients={clients} onClose={() => setPropertyEditorOpen(false)} onSaved={(property) => {
        const owner = clients.find((item) => item.id === property.ownerId)
        setProperties((current) => [property, ...current.filter((item) => item.id !== property.id)])
        setPropertyId(property.id)
        setValues((current) => ({ ...current, ...(owner && fields.includes('locador_nome') ? { locador_nome: owner.name } : {}), ...(owner && fields.includes('locador_cpf') ? { locador_cpf: owner.document } : {}), ...(owner && fields.includes('locador_telefone') ? { locador_telefone: owner.phone } : {}), ...(owner && fields.includes('locador_email') ? { locador_email: owner.email } : {}), ...(fields.includes('imovel_endereco') ? { imovel_endereco: formatPropertyAddress(property) } : {}), ...(fields.includes('imovel_cidade') ? { imovel_cidade: property.city } : {}), ...(fields.includes('imovel_estado') ? { imovel_estado: property.state } : {}), ...(fields.includes('imovel_codigo') ? { imovel_codigo: property.code } : {}) }))
        setPropertyEditorOpen(false)
      }} />}
    </div>
  )
}