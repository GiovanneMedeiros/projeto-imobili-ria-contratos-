import { ArrowUpRight, Copy, Eye, FilePlus2, FileText, History, Pencil, Power, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { demoMode } from '../lib/supabase'
import { listTemplates, setTemplateStatus } from '../services/templates'
import type { ContractTemplate } from '../types/domain'

export function TemplatesPage() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<ContractTemplate | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setTemplates(await listTemplates(true))
  }

  useEffect(() => {
    let active = true
    void listTemplates(true).then((items) => {
      if (active) setTemplates(items)
    }).catch(() => {
      if (active) setError('Não foi possível carregar os modelos.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const visible = templates.filter((template) => `${template.name} ${template.type}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))

  async function toggle(template: ContractTemplate) {
    try {
      await setTemplateStatus(template.id, template.status === 'active' ? 'inactive' : 'active', user?.id ?? '')
      await refresh()
    } catch {
      setError('Não foi possível alterar o status deste modelo.')
    }
  }

  return (
    <div className="templates-page">
      <section className="page-heading-row"><div><span className="section-overline">BIBLIOTECA · ADMINISTRAÇÃO</span><h1>Modelos de contrato</h1><p>Gerencie os documentos aprovados para uso pela equipe.</p></div><Link className="gold-button" to="/modelos/novo"><FilePlus2 size={16} />Novo modelo</Link></section>
      {demoMode && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>O único modelo incluído é técnico e não jurídico. Modelos adicionados aqui ficam apenas neste navegador.</div>}
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <section className="template-library">
        <div className="history-toolbar template-toolbar"><label className="search-control"><Search size={16} /><input aria-label="Buscar modelo" placeholder="Buscar modelo..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="template-total">{visible.length} {visible.length === 1 ? 'modelo' : 'modelos'}</span></div>
        <div className="table-scroll"><table className="data-table template-table"><thead><tr><th>NOME</th><th>TIPO</th><th>VERSÃO</th><th>STATUS</th><th>ATUALIZADO</th><th>AÇÕES</th></tr></thead><tbody>
          {visible.map((template) => <tr key={template.id}>
            <td><span className="template-name-cell"><FileText size={15} />{template.name}</span>{template.demonstration && <small>Uso somente para testes, sem conteúdo jurídico.</small>}</td>
            <td>{template.type}{template.demonstration && <small>Modo demo</small>}</td><td>v{template.version}</td>
            <td><span className={`status-pill ${template.status === 'active' ? 'status-generated' : 'status-inactive'}`}><i />{template.status === 'active' ? 'Ativo' : 'Inativo'}</span></td>
            <td>{template.versionHistory?.at(-1)?.createdAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(template.versionHistory.at(-1)!.createdAt)) : '—'}</td>
            <td><div className="row-actions"><button className="icon-button" type="button" title="Visualizar modelo" aria-label={`Visualizar ${template.name}`} onClick={() => setPreview(template)}><Eye size={15} /></button><Link className="icon-button" to={template.id === 'demo-template-v1' ? '/modelos/novo' : `/modelos/${template.id}/editar`} state={{ template }} title="Editar" aria-label={`Editar ${template.name}`}><Pencil size={14} /></Link><Link className="icon-button" to="/modelos/novo" state={{ template, duplicate: true }} title="Duplicar" aria-label={`Duplicar ${template.name}`}><Copy size={14} /></Link><button className="icon-button" type="button" title={template.status === 'active' ? 'Desativar' : 'Ativar'} aria-label={`${template.status === 'active' ? 'Desativar' : 'Ativar'} ${template.name}`} onClick={() => void toggle(template)}><Power size={14} /></button></div></td>
          </tr>)}
          {!loading && visible.length === 0 && <tr><td className="empty-table" colSpan={6}>Nenhum modelo encontrado.</td></tr>}
          {loading && <tr><td className="empty-table" colSpan={6}>Carregando modelos...</td></tr>}
        </tbody></table></div>
        {visible.some((template) => (template.versionHistory?.length ?? 0) > 1) && <div className="versions-list"><History size={15} /><span>Histórico de versões:</span>{visible.flatMap((template) => template.versionHistory ?? []).map((version) => <span className="version-chip" key={version.id}>v{version.version}</span>)}</div>}
      </section>
      {preview && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null) }}><section className="template-preview-modal" role="dialog" aria-modal="true" aria-labelledby="template-preview-title"><header><div><span className="section-overline">PRÉVIA DO MODELO</span><h2 id="template-preview-title">{preview.name}</h2></div><button className="icon-button" type="button" onClick={() => setPreview(null)} aria-label="Fechar"><X size={18} /></button></header><pre>{preview.content}</pre><footer><span>v{preview.version}{preview.demonstration ? ' · Demonstração' : ''}</span><Link className="subtle-link" to={preview.id === 'demo-template-v1' ? '/modelos/novo' : `/modelos/${preview.id}/editar`} state={{ template: preview }}>Editar<ArrowUpRight size={14} /></Link></footer></section></div>}
    </div>
  )
}