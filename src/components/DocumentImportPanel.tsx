import { AlertTriangle, Camera, Check, FileUp, LoaderCircle, ScanText, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createDocumentReader } from '../lib/documentOcr'
import { scanImageWithGemini } from '../lib/geminiDocumentScan'
import { DOCUMENT_KIND_LABELS, detectDocumentKind, parsePersonDocument, parsePropertyRegistration, type DocumentKind, type Extracted, type PersonKey, type PropertyKey } from '../lib/documentParser'
import { getFieldGroup, getFieldLabel, getFieldType } from '../lib/placeholders'

type Confidence = Extracted['confidence'] | 'edited'
interface ReviewValue { value: string; confidence: Confidence; source: string }
interface ExtraInfo { id: string; label: string; value: string; source: string }

const PERSON_ROLES: [string, string][] = [
  ['vendedor', 'Vendedor(a)'], ['anuente', 'Cônjuge do vendedor (anuente)'], ['comprador', 'Comprador(a)'], ['comprador_2', '2º comprador(a)'],
  ['locador', 'Locador(a)'], ['locatario', 'Locatário(a)'], ['locatario_2', '2º locatário(a)'],
]
const PERSON_KEYS: PersonKey[] = ['nome', 'cpf', 'rg', 'estado_civil', 'profissao', 'nacionalidade', 'endereco', 'cidade', 'estado']
const PROPERTY_KEYS: PropertyKey[] = ['matricula', 'comarca', 'endereco', 'cidade', 'descricao']
const EXTRA_LABELS: Record<string, string> = {
  data_nascimento: 'Data de nascimento', cep: 'CEP', cartorio: 'Cartório', area: 'Área', lote: 'Lote', quadra: 'Quadra',
  nome: 'Nome', cpf: 'CPF', rg: 'RG', estado_civil: 'Estado civil', profissao: 'Profissão', nacionalidade: 'Nacionalidade',
  endereco: 'Endereço', cidade: 'Cidade', estado: 'Estado', matricula: 'Matrícula', comarca: 'Comarca', descricao: 'Descrição',
}

interface DocumentImportPanelProps {
  fields: string[]
  values: Record<string, string>
  onApply: (values: Record<string, string>, overwrite: boolean) => number
}

export function DocumentImportPanel({ fields, values, onApply }: DocumentImportPanelProps) {
  const fieldKey = (key: string) => fields.includes(key) ? key : fields.includes(`opcional_${key}`) ? `opcional_${key}` : null
  const roles = useMemo(() => {
    const available = PERSON_ROLES.filter(([prefix]) => fieldKey(`${prefix}_nome`))
    if (fields.some((field) => field.replace(/^opcional_/, '').startsWith('imovel_'))) available.push(['imovel', 'Imóvel (matrícula)'])
    return available
  }, [fields])
  const [role, setRole] = useState('')
  const [kind, setKind] = useState<'auto' | DocumentKind>('auto')
  const [scanMode, setScanMode] = useState<'local' | 'gemini'>('local')
  const [progress, setProgress] = useState('')
  const [review, setReview] = useState<Record<string, ReviewValue>>({})
  const [extras, setExtras] = useState<ExtraInfo[]>([])
  const [owners, setOwners] = useState<{ nome: string; cpf?: string }[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [processed, setProcessed] = useState<{ name: string; label: string; role: string; error?: string }[]>([])
  const [processedRoles, setProcessedRoles] = useState<string[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const [message, setMessage] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)
  const readerRef = useRef<ReturnType<typeof createDocumentReader> | null>(null)
  const activeRole = roles.some(([prefix]) => prefix === role) ? role : roles[0]?.[0] ?? ''

  useEffect(() => () => { void readerRef.current?.close() }, [])

  if (!roles.length) return null

  async function processFiles(fileList: FileList | null) {
    const files = [...(fileList ?? [])]
    if (!files.length || !activeRole) return
    setMessage('')
    const reader = readerRef.current ?? createDocumentReader()
    readerRef.current = reader
    const draft = { ...review }
    const draftExtras = [...extras]
    const draftNotes = [...notes]
    let draftOwners = owners
    const roleLabel = (prefix: string): string => prefix.endsWith('_conjuge')
      ? `Cônjuge — ${roleLabel(prefix.replace(/_conjuge$/, ''))}`
      : roles.find(([item]) => item === prefix)?.[1] ?? prefix

    const put = (prefix: string, key: string, extracted: Extracted | undefined, source: string) => {
      if (!extracted?.value) return
      const target = fieldKey(`${prefix}_${key}`)
      if (!target) {
        const id = `${prefix}:${key}`
        if (!draftExtras.some((item) => item.id === id)) draftExtras.push({ id, label: `${EXTRA_LABELS[key] ?? key} — ${roleLabel(prefix)}`, value: extracted.value, source })
        return
      }
      const current = draft[target]
      if (!current?.value || (current.confidence === 'low' && extracted.confidence === 'high')) draft[target] = { ...extracted, source }
    }

    try {
      for (const file of files) {
        try {
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
          let text: string
          let scanSource = 'OCR local'
          if (scanMode === 'gemini' && !isPdf) {
            try {
              text = await scanImageWithGemini(file, setProgress)
              scanSource = 'Gemini'
            } catch (error) {
              setProgress('Gemini indisponível; tentando OCR local...')
              text = (await reader.read(file, setProgress)).text
              scanSource = 'OCR local (fallback Gemini)'
              draftNotes.push(`A imagem ${file.name} foi lida pelo OCR local porque o Gemini não estava disponível: ${error instanceof Error ? error.message : 'falha na leitura.'}`)
            }
          } else {
            text = (await reader.read(file, setProgress)).text
            if (scanMode === 'gemini' && isPdf) scanSource = 'OCR local (PDF)'
          }
          if (text.replace(/\s/g, '').length < 20) throw new Error('Nenhum texto legível. Tente uma foto mais nítida, reta e bem iluminada.')
          const detected = activeRole === 'imovel' ? 'matricula' : kind === 'auto' ? detectDocumentKind(text) : kind
          const source = `${DOCUMENT_KIND_LABELS[detected]} · ${file.name} · ${scanSource}`
          if (detected === 'matricula') {
            const result = parsePropertyRegistration(text)
            for (const key of Object.keys(result.fields) as PropertyKey[]) put('imovel', key, result.fields[key], source)
            if (result.owners.length) draftOwners = result.owners
            draftNotes.push(...result.notes)
            setProcessedRoles((current) => [...new Set([...current, 'imovel'])])
          } else {
            const result = parsePersonDocument(text, detected)
            for (const key of Object.keys(result.fields) as PersonKey[]) {
              const value = result.fields[key]
              if (key === 'endereco' && value && result.fields.cep && !fieldKey(`${activeRole}_cep`)) put(activeRole, key, { ...value, value: `${value.value}, CEP ${result.fields.cep.value}` }, source)
              else put(activeRole, key, value, source)
            }
            if (detected === 'casamento') {
              const personName = draft[fieldKey(`${activeRole}_nome`) ?? '']?.value || values[fieldKey(`${activeRole}_nome`) ?? ''] || ''
              const firstWord = (value: string) => value.split(' ')[0]?.toLowerCase()
              const spouseName = personName ? result.nameCandidates.find((candidate) => firstWord(candidate) !== firstWord(personName)) : undefined
              const personCpf = draft[fieldKey(`${activeRole}_cpf`) ?? '']?.value || values[fieldKey(`${activeRole}_cpf`) ?? ''] || ''
              const spouseCpfs = result.cpfs.filter((cpf) => cpf !== personCpf)
              const spousePrefix = activeRole === 'vendedor' && fieldKey('anuente_nome') ? 'anuente' : `${activeRole}_conjuge`
              if (spouseName) put(spousePrefix, 'nome', { value: spouseName, confidence: 'low' }, source)
              else if (result.nameCandidates.length) draftNotes.push(`Nomes lidos na certidão de casamento: ${result.nameCandidates.join(', ')}. Envie o RG/CNH antes da certidão para identificar o cônjuge automaticamente.`)
              if (spouseName && spouseCpfs.length === 1) put(spousePrefix, 'cpf', { value: spouseCpfs[0], confidence: 'high' }, source)
              if (spouseName && spousePrefix === 'anuente' && result.fields.estado_civil) put('anuente', 'estado_civil', result.fields.estado_civil, source)
            }
            draftNotes.push(...result.notes)
            setProcessedRoles((current) => [...new Set([...current, activeRole])])
          }
          setProcessed((current) => [...current, { name: file.name, label: DOCUMENT_KIND_LABELS[detected], role: roleLabel(detected === 'matricula' ? 'imovel' : activeRole) }])
        } catch (error) {
          setProcessed((current) => [...current, { name: file.name, label: 'Erro', role: roleLabel(activeRole), error: error instanceof Error ? error.message : 'Falha ao ler o documento.' }])
        }
        setReview({ ...draft })
        setExtras([...draftExtras])
        setOwners(draftOwners)
        setNotes([...new Set(draftNotes)])
      }
    } finally {
      setProgress('')
      if (fileInput.current) fileInput.current.value = ''
      if (cameraInput.current) cameraInput.current.value = ''
      setReviewOpen(true)
    }
  }

  function edit(key: string, value: string) {
    setReview((current) => ({ ...current, [key]: { value, confidence: 'edited', source: current[key]?.source ?? 'Manual' } }))
    setMessage('')
  }

  function editExtra(id: string, value: string) {
    setExtras((current) => current.map((item) => item.id === id ? { ...item, value } : item))
    setMessage('')
  }

  function assignOwner(owner: { nome: string; cpf?: string }, prefix: string) {
    const nameKey = fieldKey(`${prefix}_nome`)
    const cpfKey = fieldKey(`${prefix}_cpf`)
    setReview((current) => ({
      ...current,
      ...(nameKey ? { [nameKey]: { value: owner.nome, confidence: 'low', source: 'Proprietário na matrícula' } } : {}),
      ...(cpfKey && owner.cpf ? { [cpfKey]: { value: owner.cpf, confidence: 'high', source: 'Proprietário na matrícula' } } : {}),
    }))
    setProcessedRoles((current) => [...new Set([...current, prefix])])
  }

  function apply() {
    const result: Record<string, string> = {}
    for (const [key, item] of Object.entries(review)) {
      const value = item.value.trim()
      if (!value) continue
      const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
      result[key] = getFieldType(key) === 'date' && date ? `${date[3]}-${date[2]}-${date[1]}` : value
    }
    const count = onApply(result, overwrite)
    setMessage(count ? `${count} campo(s) aplicados. Confira nas etapas abaixo e complete os dados da negociação.` : 'Nenhum campo aplicado — os campos já estavam preenchidos. Marque "substituir" para sobrescrever.')
    if (count) setReviewOpen(false)
  }

  function reset() {
    setReview({}); setExtras([]); setOwners([]); setNotes([]); setProcessed([]); setProcessedRoles([]); setMessage('')
    setReviewOpen(false)
  }

  const reviewKeys = [...new Set([
    ...processedRoles.flatMap((prefix) => (prefix === 'imovel' ? PROPERTY_KEYS : PERSON_KEYS).map((key) => fieldKey(`${prefix}_${key}`)).filter((key): key is string => Boolean(key))),
    ...Object.keys(review),
  ])]
  const grouped = new Map<string, string[]>()
  for (const key of reviewKeys) {
    const prefix = key.replace(/^opcional_/, '')
    const group = prefix.startsWith('comprador_2') ? '2º comprador(a)' : prefix.startsWith('locatario_2') ? '2º locatário(a)' : prefix.startsWith('anuente') ? 'Cônjuge do vendedor (anuente)' : getFieldGroup(key)
    grouped.set(group, [...(grouped.get(group) ?? []), key])
  }

  return (
    <div className="doc-import">
      <p className="doc-import-intro"><ScanText size={15} />Escolha OCR local para manter o arquivo no navegador ou Gemini para enviar imagens ao serviço do Google. PDFs usam o OCR local; confira todos os dados antes de gerar o contrato.</p>
      <div className="reference-grid">
        <label className="editor-field">Leitura da imagem
          <select value={scanMode} onChange={(event) => setScanMode(event.target.value as 'local' | 'gemini')} disabled={Boolean(progress)}>
            <option value="local">OCR local (privado)</option>
            <option value="gemini">Gemini AI (envia imagem ao Google)</option>
          </select>
        </label>
        <label className="editor-field">Documento de quem?
          <select value={activeRole} onChange={(event) => setRole(event.target.value)} disabled={Boolean(progress)}>
            {roles.map(([prefix, label]) => <option value={prefix} key={prefix}>{label}</option>)}
          </select>
        </label>
        <label className="editor-field">Tipo de documento
          <select value={activeRole === 'imovel' ? 'matricula' : kind} onChange={(event) => setKind(event.target.value as 'auto' | DocumentKind)} disabled={Boolean(progress) || activeRole === 'imovel'}>
            <option value="auto">Detectar automaticamente</option>
            {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).filter((item) => item !== 'matricula').map((item) => <option value={item} key={item}>{DOCUMENT_KIND_LABELS[item]}</option>)}
            <option value="matricula">{DOCUMENT_KIND_LABELS.matricula}</option>
          </select>
        </label>
      </div>
      <div className="doc-import-actions">
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => void processFiles(event.target.files)} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void processFiles(event.target.files)} />
        <button className="outline-button" type="button" disabled={Boolean(progress)} onClick={() => fileInput.current?.click()}><FileUp size={14} />Enviar arquivos</button>
        <button className="outline-button" type="button" disabled={Boolean(progress)} onClick={() => cameraInput.current?.click()}><Camera size={14} />Fotografar</button>
        {progress && <span className="doc-import-progress" role="status"><LoaderCircle className="spin-icon" size={14} />{progress}</span>}
      </div>

      {processed.length > 0 && !reviewOpen && <div className="doc-import-result-link">
        <span>{processed.filter((item) => !item.error).length} documento(s) lido(s)</span>
        <button className="inline-create-link" type="button" onClick={() => setReviewOpen(true)}>Revisar dados</button>
      </div>}
      {message && !reviewOpen && <div className="success-alert" role="status"><Check size={15} />{message}</div>}

      {reviewOpen && <div className="modal-backdrop doc-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false) }}>
        <section className="doc-import-modal" role="dialog" aria-modal="true" aria-labelledby="doc-import-title">
          <header>
            <div><span className="section-overline">LEITURA AUTOMÁTICA</span><h2 id="doc-import-title">Confira os dados encontrados</h2><p>Corrija o que precisar antes de aplicar ao contrato.</p></div>
            <button className="icon-button" type="button" onClick={() => setReviewOpen(false)} aria-label="Fechar conferência"><X size={17} /></button>
          </header>
          <div className="doc-import-modal-body">
            <ul className="doc-import-files">
              {processed.map((item, index) => <li key={`${item.name}-${index}`} className={item.error ? 'doc-import-file-error' : ''}>{item.error ? <AlertTriangle size={13} /> : <Check size={13} />}<span><strong>{item.label}</strong> · {item.role} · {item.name}{item.error ? ` — ${item.error}` : ''}</span></li>)}
            </ul>
            {notes.map((note) => <div className="template-demo-alert" key={note}><AlertTriangle size={14} /><span>{note}</span></div>)}
            {owners.length > 0 && <div className="doc-import-owners">
              <strong>Proprietários encontrados na matrícula (sugestão)</strong>
              {owners.map((owner) => <div key={owner.nome} className="doc-import-owner">
                <span>{owner.nome}{owner.cpf ? ` · CPF ${owner.cpf}` : ''}</span>
                {fieldKey('vendedor_nome') && <button className="inline-create-link" type="button" onClick={() => assignOwner(owner, 'vendedor')}>Usar como vendedor</button>}
                {fieldKey('anuente_nome') && <button className="inline-create-link" type="button" onClick={() => assignOwner(owner, 'anuente')}>Usar como anuente</button>}
                {fieldKey('locador_nome') && <button className="inline-create-link" type="button" onClick={() => assignOwner(owner, 'locador')}>Usar como locador</button>}
              </div>)}
            </div>}
            {reviewKeys.length > 0 ? <div className="doc-import-review">
        <h3>Dados extraídos</h3>
        <p className="doc-import-hint">Confira os campos e corrija se necessário. <b className="conf-badge conf-low">Conferir</b> = leitura automática · <b className="conf-badge conf-high">Validado</b> = CPF validado · <b className="conf-badge conf-empty">Não encontrado</b> = completar manualmente.</p>
        {[...grouped.entries()].map(([group, keys]) => <fieldset className="dynamic-fieldset" key={group}>
          <legend>{group}</legend>
          <div className="dynamic-field-grid">
            {keys.map((key) => {
              const item = review[key]
              const status = !item?.value ? 'empty' : item.confidence
              const badge = { empty: 'Não encontrado', low: 'Conferir', high: 'Validado', edited: 'Editado' }[status]
              const wide = /descricao|endereco|_nome$/.test(key)
              return <label className={`editor-field${wide ? ' field-wide' : ''}`} key={key} title={item?.source}>
                <span className="doc-import-label">{getFieldLabel(key)}<b className={`conf-badge conf-${status}`}>{badge}</b></span>
                {key.includes('descricao')
                  ? <textarea rows={5} value={item?.value ?? ''} onChange={(event) => edit(key, event.target.value)} placeholder="Preencher manualmente" />
                  : <input value={item?.value ?? ''} onChange={(event) => edit(key, event.target.value)} placeholder="Preencher manualmente" />}
              </label>
            })}
          </div>
        </fieldset>)}
        {extras.length > 0 && <div className="doc-import-extras">
          <strong>Outras informações lidas (sem campo correspondente neste modelo)</strong>
          <div className="doc-import-extra-fields">{extras.map((item) => <label className="editor-field" key={item.id} title={item.source}>{item.label}<input value={item.value} onChange={(event) => editExtra(item.id, event.target.value)} /></label>)}</div>
        </div>}
        <div className="doc-import-apply">
          <label className="doc-import-overwrite"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />Substituir campos já preenchidos</label>
          <button className="outline-button" type="button" onClick={reset}><Trash2 size={14} />Limpar leitura</button>
          <button className="gold-button" type="button" onClick={apply} disabled={Boolean(progress)}><Check size={15} />Aplicar dados ao contrato</button>
        </div>
        {message && <div className="success-alert" role="status"><Check size={15} />{message}</div>}
            </div> : <div className="doc-import-no-data"><AlertTriangle size={16} />Nenhum dado compatível foi reconhecido. Tente uma imagem mais nítida ou confira os campos manualmente.</div>}
          </div>
        </section>
      </div>}
    </div>
  )
}
