import { ArrowLeft, Braces, Eye, FileUp, LoaderCircle, Plus, Save } from 'lucide-react'
import { z } from 'zod'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { extractPlaceholders } from '../lib/placeholders'
import { extractPdfText, renderPdfPageToCanvas } from '../lib/pdf'
import { createTemplate, listTemplates, updateTemplate } from '../services/templates'
import type { ContractTemplate } from '../types/domain'

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do modelo.'),
  type: z.string().trim().min(2, 'Selecione o tipo de contrato.'),
  content: z.string().trim().min(12, 'Adicione o conteúdo aprovado pela Miellis.'),
}).refine((value) => extractPlaceholders(value.content).length > 0, { message: 'Adicione pelo menos um campo no formato {{campo}}.', path: ['content'] })

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
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fields = useMemo(() => extractPlaceholders(content), [content])

  useEffect(() => {
    if (!pdfFile || !pdfCanvasRef.current) return
    let active = true
    void renderPdfPageToCanvas(pdfFile, pdfCanvasRef.current).catch(() => {
      if (active) setError('Não foi possível renderizar a prévia do PDF original.')
    })
    return () => { active = false }
  }, [pdfFile])

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    setError('')
    try {
      const importedText = await extractPdfText(file)
      if (!importedText.trim()) {
        throw new Error('O PDF não contém texto legível para importar.')
      }
      setPdfFile(file)
      setContent(importedText)
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível importar o PDF.')
    } finally {
      setUploadingPdf(false)
      event.target.value = ''
    }
  }

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
    }).catch(() => {
      if (active) setError('Não foi possível carregar o modelo selecionado.')
    })
    return () => { active = false }
  }, [id, template?.id])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const validation = schema.safeParse({ name, type, content })
    if (!validation.success) return setError(validation.error.issues[0]?.message ?? 'Confira os campos do modelo.')
    if (!user) return setError('Sua sessão expirou. Entre novamente para continuar.')
    setBusy(true)
    try {
      const saved = isEdit && template
        ? await updateTemplate(template.id, validation.data, user.id)
        : await createTemplate(validation.data, user.id)
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
              {uploadingPdf ? 'Importando PDF...' : 'Importar PDF do modelo'}
            </button>
            <span>Carregue o PDF aprovado e edite apenas as cláusulas que precisam mudar.</span>
          </div>
          <div className="editor-section-head editor-section-spaced"><div><span className="section-overline">DOCUMENTO</span><h2>Conteúdo do template</h2></div><button className="icon-button preview-toggle" type="button" onClick={() => setShowPreview((value) => !value)} title="Alternar prévia" aria-label="Alternar prévia"><Eye size={16} /></button></div>
          <label className="editor-field template-content-label">Texto aprovado pela imobiliária<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={'Cole o documento aprovado pela Miellis e adicione os campos variáveis, por exemplo:\n\nLOCADOR: {{locador_nome}}\nCPF/CNPJ: {{locador_cpf}}\n\nUse apenas placeholders que existam no modelo autorizado.'} rows={17} required /></label>
          <div className="placeholder-summary"><span><Braces size={15} />{fields.length} {fields.length === 1 ? 'campo identificado' : 'campos identificados'}</span><div>{fields.map((field) => <code key={field}>{`{{${field}}}`}</code>)}</div></div>
          {error && <div className="inline-alert" role="alert">{error}</div>}
          <footer className="editor-actions"><span>{isEdit ? `Versão atual: ${template?.version ?? '—'}` : 'As versões salvas não apagam modelos anteriores.'}</span><button className="gold-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin-icon" size={15} /> : isEdit ? <Plus size={15} /> : <Save size={15} />}{busy ? 'Salvando...' : isEdit ? 'Salvar nova versão' : 'Cadastrar modelo'}</button></footer>
        </form>
        {showPreview && <section className="template-live-preview"><div className="preview-panel-head"><div><span className="section-overline">PRÉVIA DO TEMPLATE</span><h2>{name || 'Novo modelo'}</h2></div><span className="paper-size">{fields.length} campos</span></div>{pdfFile ? <div className="contract-pdf-preview-wrap"><canvas ref={pdfCanvasRef} className="contract-pdf-canvas" /><div className="pdf-overlay-note">Base visual importada do PDF original</div></div> : <article className="contract-paper"><pre>{content || 'O conteúdo do documento aparecerá aqui.'}</pre></article>}</section>}
      </div>
    </div>
  )
}