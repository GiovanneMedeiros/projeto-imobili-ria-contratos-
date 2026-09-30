import { ArrowDownToLine, ArrowLeft, Copy, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { downloadSavedContract, getContractDetails } from '../services/contracts'

interface ContractDetails {
  id: string
  name?: string
  title?: string
  templateName?: string
  clientName: string
  propertyAddress: string
  createdBy?: string
  createdAt: string
  fileName?: string
  pdf_path?: string | null
  template_id?: string
  client_id?: string
  property_id?: string
  fields?: Record<string, string>
  content?: string
  rendered_content?: string
}

export function ContractDetailsPage() {
  const { id = '' } = useParams()
  const { demo } = useAuth()
  const [contract, setContract] = useState<ContractDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getContractDetails(id).then((value) => {
      if (active) setContract(value as ContractDetails | null)
    }).catch(() => {
      if (active) setError('Não foi possível abrir este contrato. Verifique suas permissões.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [id])

  async function download() {
    try {
      await downloadSavedContract(id)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Não foi possível baixar o PDF.')
    }
  }

  if (loading) return <div className="route-loading" role="status">Carregando contrato...</div>
  if (error && !contract) return <div className="inline-alert" role="alert">{error}</div>
  if (!contract) return <div className="empty-page"><span className="section-overline">CONTRATO NÃO ENCONTRADO</span><h1>Este registro não está disponível</h1><Link className="subtle-link" to="/contratos"><ArrowLeft size={15} />Voltar ao histórico</Link></div>

  const name = contract.title ?? contract.name ?? 'Contrato'
  const body = contract.content ?? contract.rendered_content ?? ''
  const hasPdf = Boolean(contract.fileName || contract.pdf_path)

  return (
    <div className="details-page">
      <section className="page-heading-row"><div><span className="section-overline">CONTRATOS · REGISTRO</span><h1>{name}</h1><p>{contract.templateName ?? 'Modelo de demonstração'} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(contract.createdAt))}</p></div><Link className="outline-button" to="/contratos"><ArrowLeft size={15} />Voltar</Link></section>
      {demo && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>Registro de teste. Não representa um contrato real da imobiliária.</div>}
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <div className="detail-grid">
        <section className="detail-summary"><span className="section-overline">VÍNCULOS</span><dl><div><dt>Cliente</dt><dd>{contract.clientName}</dd></div><div><dt>Imóvel</dt><dd>{contract.propertyAddress}</dd></div><div><dt>Criado por</dt><dd>{contract.createdBy ?? 'Equipe Miellis'}</dd></div><div><dt>Arquivo</dt><dd>{contract.fileName ?? 'Documento não disponível'}</dd></div></dl><div className="detail-actions"><button className="gold-button" type="button" disabled={!hasPdf} onClick={() => void download()}><ArrowDownToLine size={16} />Baixar documento</button><Link className="outline-button" to="/contratos/novo" state={{ duplicateContract: { id: contract.template_id, templateId: contract.template_id, templateName: contract.templateName, clientId: contract.client_id, propertyId: contract.property_id, fields: contract.fields } }}><Copy size={15} />Duplicar</Link></div></section>
        <section className="detail-document"><div className="detail-document-head"><FileText size={16} /><span>Conteúdo registrado</span></div><pre>{body || 'O texto do documento não está disponível para este registro.'}</pre></section>
      </div>
    </div>
  )
}