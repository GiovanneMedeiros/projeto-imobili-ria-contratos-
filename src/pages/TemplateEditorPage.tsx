import { ArrowLeft, Braces, Crosshair, Eye, FileUp, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { extractPlaceholders, getFieldLabel, getFieldType } from '../lib/placeholders'
import { extractPdfText, getPdfPageCount, renderPdfPageToCanvas } from '../lib/pdf'
import { createTemplate, getTemplatePdfBytes, listTemplates, updateTemplate } from '../services/templates'
import type { ContractTemplate, ContractTemplateField } from '../types/domain'

const fieldOptions = [
  'locador_nome', 'locador_cpf', 'locador_telefone', 'locador_email',
  'locatario_nome', 'locatario_cpf', 'locatario_telefone', 'locatario_email',
  'imovel_endereco', 'imovel_numero', 'imovel_complemento', 'imovel_bairro', 'imovel_cidade', 'imovel_estado', 'imovel_cep',
  'valor_aluguel', 'valor_condominio', 'valor_iptu', 'forma_pagamento', 'garantia', 'data_inicio', 'data_fim', 'prazo', 'observacoes', 'campo_personalizado',
]

const LivePdfPreview = lazy(async () => {
  const [{ PDFViewer }, { ContractPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ContractPdf'),
  ])
  return {
    default: function Preview({ title, content }: { title: string, content: string }) {
      return <PDFViewer className="template-pdf-viewer" showToolbar><ContractPdfDocument title={title} content={content} /></PDFViewer>
    },
  }
})

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do modelo.'),
  type: z.string().trim().min(2, 'Selecione o tipo de contrato.'),
  content: z.string().trim().min(12, 'Adicione o conteúdo aprovado pela Miellis.'),
  pdfFields: z.array(z.object({ key: z.string(), label: z.string(), page: z.number(), x: z.number(), y: z.number(), width: z.number() })),
}).refine((value) => extractPlaceholders(value.content).length > 0 || value.pdfFields.length > 0, { message: 'Adicione um campo visual no PDF ou use marcadores no documento.', path: ['pdfFields'] })

interface EditorLocationState {
  template?: ContractTemplate
  duplicate?: boolean
}

export function TemplateEditorPage() {
  const { id } = useParams()
  const location = useLocation()
  const state = location.state as EditorLocationState | null
  const { user } = useAuth()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [template, setTemplate] = useState<ContractTemplate | undefined>(state?.template)
  const [name, setName] = useState(state?.duplicate ? `Cópia de ${state.template?.name ?? ''}` : state?.template?.name ?? '')
  const [type, setType] = useState(state?.template?.type ?? '')
  const [content, setContent] = useState(state?.template?.content ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [sourcePdf, setSourcePdf] = useState<File | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('')
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfFields, setPdfFields] = useState<ContractTemplateField[]>(state?.template?.pdfFields ?? [])
  const [selectedFieldKey, setSelectedFieldKey] = useState(fieldOptions[4])
  const [placingFieldKey, setPlacingFieldKey] = useState('')
  const [placingFieldLabel, setPlacingFieldLabel] = useState('')
  const [customFieldLabel, setCustomFieldLabel] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pdfCanvasRefs = useRef(new Map<number, HTMLCanvasElement>())
  const pdfPreviewUrlRef = useRef('')
  const pdfSelectionVersionRef = useRef(0)
  const fields = useMemo(() => extractPlaceholders(content), [content])
  const fieldCount = pdfFields.length || fields.length

  useEffect(() => () => {
    if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current)
  }, [])

  useEffect(() => {
    if (!template?.sourcePdfPath && !template?.sourcePdfData) return
    let active = true
    const selectionVersion = pdfSelectionVersionRef.current
    void getTemplatePdfBytes(template).then(async (bytes) => {
      if (!active || selectionVersion !== pdfSelectionVersionRef.current) return
      const file = new File([bytes], `${template.name}.pdf`, { type: 'application/pdf' })
      const pageCount = await getPdfPageCount(file)
      if (!active || selectionVersion !== pdfSelectionVersionRef.current) return
      const url = URL.createObjectURL(file)
      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current)
      pdfPreviewUrlRef.current = url
      setSourcePdf(file)
      setPdfPageCount(pageCount)
      setPdfPreviewUrl(url)
    }).catch(() => {
      if (active) setError('Não foi possível carregar o PDF original deste modelo.')
    })
    return () => { active = false }
  }, [template?.id, template?.versionId, template?.sourcePdfPath, template?.sourcePdfData])

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    setError('')
    try {
      const importedText = await extractPdfText(file)
      const pageCount = await getPdfPageCount(file)
      pdfSelectionVersionRef.current += 1
      const url = URL.createObjectURL(file)
      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current)
      pdfPreviewUrlRef.current = url
      setPdfPreviewUrl(url)
      setSourcePdf(file)
      setPdfPageCount(pageCount)
      setPdfFields([])
      setPlacingFieldKey('')
      setContent(importedText || 'Documento sem texto extraível; use os campos visuais no PDF.')
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível importar o PDF.')
    } finally {
      setUploadingPdf(false)
      event.target.value = ''
    }
  }

  useEffect(() => {
    if (!sourcePdf || pdfPageCount === 0) return
    let active = true
    void (async () => {
      for (const page of [...Array(pdfPageCount).keys()].map((index) => index + 1)) {
        const canvas = pdfCanvasRefs.current.get(page)
        if (canvas) await renderPdfPageToCanvas(sourcePdf, canvas, page)
      }
    })().catch(() => {
      if (active) setError('Não foi possível desenhar as páginas do PDF para posicionar os campos.')
    })
    return () => { active = false }
  }, [sourcePdf, pdfPageCount])

  useEffect(() => {
    if (!id || template?.id === id) return
    let active = true
    void listTemplates(true).then((templates) => {
      const found = templates.find((item) => item.id === id)
      if (!active) return
      if (!found) return setError('O modelo não foi encontrado.')
      setTemplate(found)
      setName(found.name)
      setType(found.type)
      setContent(found.content)
      setPdfFields(found.pdfFields ?? [])
    }).catch(() => {
      if (active) setError('Não foi possível carregar o modelo selecionado.')
    })
    return () => { active = false }
  }, [id, template?.id])

  function placeField(event: React.MouseEvent<HTMLDivElement>, page: number) {
    if (!placingFieldKey) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(1, Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100))
    const y = Math.max(1, Math.min(95, ((event.clientY - bounds.top) / bounds.height) * 100))
    const kind = getFieldType(placingFieldKey)
    const width = kind === 'text' ? 42 : kind === 'currency' ? 24 : 28
    setPdfFields((current) => [...current, { key: placingFieldKey, label: placingFieldLabel, page, x, y, width }])
    setPlacingFieldKey('')
    setPlacingFieldLabel('')
  }

  function startFieldPlacement() {
    if (selectedFieldKey !== 'campo_personalizado') {
      setPlacingFieldKey(selectedFieldKey)
      setPlacingFieldLabel(getFieldLabel(selectedFieldKey))
      return
    }
    const label = customFieldLabel.trim()
    if (label.length < 2) return setError('Informe um nome para o campo personalizado.')
    const key = `campo_${label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
    setPlacingFieldKey(key)
    setPlacingFieldLabel(label)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const validation = schema.safeParse({ name, type, content, pdfFields })
    if (!validation.success) return setError(validation.error.issues[0]?.message ?? 'Confira os campos do modelo.')
    if (!user) return setError('Sua sessão expirou. Entre novamente para continuar.')
    setBusy(true)
    try {
      const saved = isEdit && template
        ? await updateTemplate(template.id, { ...validation.data, sourcePdf, pdfFields }, user.id)
        : await createTemplate({ ...validation.data, sourcePdf, pdfFields }, user.id)
      navigate('/modelos', { replace: true, state: { notice: isEdit ? `Nova versão v${saved.version} salva; versões anteriores foram mantidas.` : 'Modelo cadastrado.' } })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o modelo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="template-editor-page">
      <section className="page-heading-row"><div><span className="section-overline">MODELOS · {isEdit ? 'NOVA VERSÃO' : 'CADASTRO'}</span><h1>{isEdit ? 'Editar modelo' : state?.duplicate ? 'Duplicar modelo' : 'Novo modelo'}</h1><p>Insira o documento aprovado sem alterar o texto jurídico.</p></div><Link className="outline-button" to="/modelos"><ArrowLeft size={15} />Voltar aos modelos</Link></section>
      {template?.demonstration && <div className="demo-warning"><span className="demo-badge"><i />MODELO TÉCNICO</span>Esta demonstração não contém cláusulas jurídicas. Substitua o texto integralmente antes do uso real.</div>}
      <div className="template-editor-layout">
        <form className="template-form-panel" onSubmit={(event) => void submit(event)}>
          <div className="editor-section-head"><div><span className="section-overline">IDENTIFICAÇÃO</span><h2>Dados do modelo</h2></div>{isEdit && <span className="field-count">Nova versão após salvar</span>}</div>
          <div className="template-metadata-grid"><label className="editor-field">Nome do modelo<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Locação residencial Miellis" required /></label><label className="editor-field">Tipo<select value={type} onChange={(event) => setType(event.target.value)} required><option value="">Selecionar tipo</option><option>Locação residencial</option><option>Compra e venda</option><option>Administração</option><option>Outro</option></select></label></div>
          <div className="pdf-import-row">
            <input ref={fileInputRef} type="file" accept="application/pdf" onChange={(event) => void handlePdfUpload(event)} hidden />
            <button className="outline-button pdf-import-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPdf}>
              {uploadingPdf ? <LoaderCircle className="spin-icon" size={15} /> : <FileUp size={15} />}
              {uploadingPdf ? 'Importando PDF...' : sourcePdf ? 'Trocar PDF original' : 'Importar PDF original'}
            </button>
            <span>{sourcePdf ? `${pdfPageCount || '...'} páginas · ${pdfFields.length} campos posicionados` : 'Importe o PDF e clique onde cada informação deve aparecer.'}</span>
          </div>
          {sourcePdf && <div className="pdf-field-setup">
            <label className="editor-field">Campo para posicionar<select value={selectedFieldKey} onChange={(event) => setSelectedFieldKey(event.target.value)}>{fieldOptions.map((field) => <option key={field} value={field}>{field === 'campo_personalizado' ? 'Outro dado...' : getFieldLabel(field)}</option>)}</select></label>
            {selectedFieldKey === 'campo_personalizado' && <label className="editor-field">Nome do dado<input value={customFieldLabel} onChange={(event) => setCustomFieldLabel(event.target.value)} placeholder="Ex.: Número da matrícula" /></label>}
            <button className={placingFieldKey ? 'gold-button' : 'outline-button'} type="button" onClick={() => placingFieldKey ? (setPlacingFieldKey(''), setPlacingFieldLabel('')) : startFieldPlacement()}><Crosshair size={15} />{placingFieldKey ? `Clique na página para inserir ${placingFieldLabel}` : 'Posicionar campo no PDF'}</button>
            <div className="pdf-field-list" aria-label="Campos posicionados">{pdfFields.map((field, index) => <div className="pdf-field-list-row" key={`${field.key}-${field.page}-${index}`}><span>{field.label} · página {field.page}</span><button className="icon-button" type="button" title={`Remover ${field.label}`} aria-label={`Remover ${field.label}`} onClick={() => setPdfFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div>)}</div>
            <p className="preview-footnote">Posicione sobre espaços em branco do documento. Você pode adicionar o mesmo dado mais de uma vez.</p>
          </div>}
          <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">DOCUMENTO</span><h2>Conteúdo do template</h2></div><button className="icon-button preview-toggle" type="button" onClick={() => setShowPreview((value) => !value)} title="Alternar prévia" aria-label="Alternar prévia"><Eye size={16} /></button></div>
          <label className="editor-field template-content-label">{sourcePdf ? 'Texto extraído para referência dos campos' : 'Texto aprovado pela imobiliária'}<textarea value={content} onChange={(event) => setContent(event.target.value)} readOnly={Boolean(sourcePdf)} placeholder={'Cole o documento aprovado pela Miellis e adicione os campos variáveis, por exemplo:\n\nLOCADOR: {{locador_nome}}\nCPF/CNPJ: {{locador_cpf}}\n\nUse apenas placeholders que existam no modelo autorizado.'} rows={17} required /></label>
          {!sourcePdf && <div className="placeholder-summary"><span><Braces size={15} />{fields.length} {fields.length === 1 ? 'campo identificado' : 'campos identificados'}</span><div>{fields.map((field) => <code key={field}>{`{{${field}}}`}</code>)}</div></div>}
          {error && <div className="inline-alert" role="alert">{error}</div>}
          <footer className="editor-actions"><span>{isEdit ? `Versão atual: ${template?.version ?? '—'}` : 'As versões salvas não apagam modelos anteriores.'}</span><button className="gold-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin-icon" size={15} /> : isEdit ? <Plus size={15} /> : <Save size={15} />}{busy ? 'Salvando...' : isEdit ? 'Salvar nova versão' : 'Cadastrar modelo'}</button></footer>
        </form>
        {showPreview && <section className="template-live-preview"><div className="preview-panel-head"><div><span className="section-overline">PDF ORIGINAL</span><h2>{name || 'Novo modelo'}</h2></div><span className="paper-size">{fieldCount} {fieldCount === 1 ? 'campo' : 'campos'}</span></div>{sourcePdf && pdfPageCount > 0 ? <div className="pdf-placement-pages">{[...Array(pdfPageCount).keys()].map((index) => {
          const page = index + 1
          return <div className={`pdf-placement-page${placingFieldKey ? ' is-placing' : ''}`} key={page} onClick={(event) => placeField(event, page)}>
            <canvas ref={(canvas) => { if (canvas) pdfCanvasRefs.current.set(page, canvas); else pdfCanvasRefs.current.delete(page) }} className="pdf-placement-canvas" />
            {pdfFields.filter((field) => field.page === page).map((field, fieldIndex) => <span className="pdf-placement-marker" key={`${field.key}-${fieldIndex}`} style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%` }}>{field.label}</span>)}
            <span className="pdf-placement-page-number">Página {page}</span>
          </div>
        })}</div> : pdfPreviewUrl ? <iframe className="template-pdf-viewer" src={pdfPreviewUrl} title={`PDF original: ${name || 'novo modelo'}`} /> : <Suspense fallback={<div className="template-pdf-loading">Preparando prévia...</div>}><LivePdfPreview title={name || 'Novo modelo'} content={content || 'O conteúdo do documento aparecerá aqui.'} /></Suspense>}<p className="preview-footnote">{placingFieldKey ? 'Clique no documento no local em que o valor deverá aparecer.' : 'O PDF original é preservado. Adicione campos clicando nos espaços em branco.'}</p></section>}
      </div>
    </div>
  )
}