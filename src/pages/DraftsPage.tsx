import { ArrowUpRight, FileText, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteContractDraft, loadContractDrafts } from '../services/contracts'
import type { ContractDraft } from '../types/domain'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function DraftsPage() {
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<ContractDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      setDrafts(await loadContractDrafts())
      setError('')
    } catch {
      setError('Não foi possível carregar os rascunhos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function remove(id: string) {
    try {
      await deleteContractDraft(id)
      setDrafts((current) => current.filter((draft) => draft.id !== id))
    } catch {
      setError('Não foi possível excluir o rascunho.')
    }
  }

  return (
    <div className="contracts-page">
      <section className="page-heading-row">
        <div>
          <span className="section-overline">DOCUMENTOS · RASCUNHOS</span>
          <h1>Rascunhos</h1>
          <p>Continue contratos em andamento e recupere trabalho sem perder dados.</p>
        </div>
        <Link className="gold-button" to="/contratos/novo"><FileText size={16} />Novo contrato</Link>
      </section>

      {error && <div className="inline-alert" role="alert">{error}</div>}

      <section className="history-section">
        <div className="history-toolbar template-toolbar">
          <span className="template-total">{drafts.length} rascunho{drafts.length === 1 ? '' : 's'}</span>
        </div>

        <div className="table-scroll">
          <table className="data-table history-table">
            <thead>
              <tr>
                <th>CONTRATO</th>
                <th>CLIENTE</th>
                <th>IMÓVEL</th>
                <th>MODELO</th>
                <th>PREENCHIMENTO</th>
                <th>ÚLTIMA ATUALIZAÇÃO</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td><strong className="template-name-cell">{draft.title || 'Contrato sem nome'}</strong></td>
                  <td>{draft.clientName ?? 'Não selecionado'}</td>
                  <td>{draft.propertyAddress ?? 'Não selecionado'}</td>
                  <td>{draft.templateName ?? 'Modelo'}</td>
                  <td>{Math.round(draft.percentComplete ?? 0)}%</td>
                  <td>{formatDate(draft.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" type="button" onClick={() => navigate('/contratos/novo', { state: { draftId: draft.id } })} aria-label={`Continuar rascunho ${draft.title}`}><ArrowUpRight size={15} /></button>
                      <button className="icon-button" type="button" onClick={() => void remove(draft.id)} aria-label={`Excluir rascunho ${draft.title}`}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && drafts.length === 0 && (
                <tr>
                  <td className="empty-table" colSpan={7}>Nenhum rascunho encontrado. Inicie um contrato para criar o primeiro.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="empty-table" colSpan={7}>Carregando rascunhos...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
