import { ArrowDownToLine, ArrowDownUp, ArrowUpRight, Copy, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadSavedContract, listContracts } from '../services/contracts'
import type { ContractRecord } from '../types/domain'

const PAGE_SIZE = 10

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

export function ContractsPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('todos')
  const [templateFilter, setTemplateFilter] = useState('todos')
  const [clientFilter, setClientFilter] = useState('todos')
  const [userFilter, setUserFilter] = useState('todos')
  const [period, setPeriod] = useState('')
  const [page, setPage] = useState(1)
  const [newestFirst, setNewestFirst] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listContracts().then((items) => {
      if (active) setContracts(items)
    }).catch(() => {
      if (active) setError('Não foi possível carregar o histórico de contratos.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR')
    return [...contracts].filter((contract) => {
      const matchesSearch = !search || [contract.title, contract.templateName, contract.clientName, contract.propertyAddress, contract.createdBy].some((value) => value.toLocaleLowerCase('pt-BR').includes(search))
      const matchesStatus = status === 'todos' || contract.status === status
      const matchesTemplate = templateFilter === 'todos' || contract.templateName === templateFilter
      const matchesClient = clientFilter === 'todos' || contract.clientName === clientFilter
      const matchesUser = userFilter === 'todos' || contract.createdBy === userFilter
      const matchesPeriod = !period || contract.createdAt.slice(0, 7) === period
      return matchesSearch && matchesStatus && matchesTemplate && matchesClient && matchesUser && matchesPeriod
    }).sort((left, right) => newestFirst ? right.createdAt.localeCompare(left.createdAt) : left.createdAt.localeCompare(right.createdAt))
  }, [clientFilter, contracts, newestFirst, period, query, status, templateFilter, userFilter])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function download(contract: ContractRecord) {
    if (!contract.fileName && !contract.pdfPath) return
    try {
      await downloadSavedContract(contract.id)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Não foi possível baixar o PDF.')
    }
  }

  return (
    <div className="contracts-page">
      <section className="page-heading-row">
        <div><span className="section-overline">DOCUMENTOS · HISTÓRICO</span><h1>Contratos</h1><p>Consulte e baixe os documentos gerados.</p></div>
        <Link className="gold-button" to="/contratos/novo"><span>＋</span>Novo contrato</Link>
      </section>
      <section className="history-section">
        <div className="history-toolbar">
          <label className="search-control"><Search size={16} /><input aria-label="Buscar contrato" placeholder="Buscar por contrato, cliente, imóvel..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label>
          <label className="filter-control">Tipo<select aria-label="Filtrar por tipo" value={templateFilter} onChange={(event) => { setTemplateFilter(event.target.value); setPage(1) }}><option value="todos">Todos</option>{[...new Set(contracts.map((item) => item.templateName))].map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
          <label className="filter-control">Cliente<select aria-label="Filtrar por cliente" value={clientFilter} onChange={(event) => { setClientFilter(event.target.value); setPage(1) }}><option value="todos">Todos</option>{[...new Set(contracts.map((item) => item.clientName))].map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
          <label className="filter-control">Usuário<select aria-label="Filtrar por usuário" value={userFilter} onChange={(event) => { setUserFilter(event.target.value); setPage(1) }}><option value="todos">Todos</option>{[...new Set(contracts.map((item) => item.createdBy))].map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
          <label className="filter-control">Status<select aria-label="Filtrar por status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="todos">Todos</option><option value="Gerado">Gerado</option><option value="Em revisão">Em revisão</option><option value="Assinado">Assinado</option></select></label>
          <label className="filter-control">Período<input aria-label="Filtrar por mês" type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }} /></label>
        </div>
        {error && <div className="inline-alert" role="alert">{error}</div>}
        <div className="table-scroll">
          <table className="data-table history-table">
            <thead><tr><th>CONTRATO</th><th>CLIENTE</th><th>IMÓVEL</th><th>CRIADO POR</th><th><button className="sort-button" type="button" onClick={() => setNewestFirst((value) => !value)}>DATA <ArrowDownUp size={12} /></button></th><th>STATUS</th><th>AÇÕES</th></tr></thead>
            <tbody>
              {visible.map((contract) => (
                <tr key={contract.id}>
                  <td><Link className="table-contract-link" to={`/contratos/${contract.id}`}>{contract.title}</Link><small>{contract.templateName}</small></td>
                  <td>{contract.clientName}</td><td>{contract.propertyAddress}</td><td>{contract.createdBy}</td><td>{formatDate(contract.createdAt)}</td>
                  <td><span className={`status-pill status-${contract.status === 'Assinado' ? 'signed' : contract.status === 'Em revisão' ? 'review' : 'generated'}`}><i />{contract.status}</span></td>
                  <td><div className="row-actions"><Link className="icon-button" to={`/contratos/${contract.id}`} title="Visualizar" aria-label={`Visualizar ${contract.title}`}><ArrowUpRight size={15} /></Link><button className="icon-button" type="button" onClick={() => void download(contract)} disabled={!contract.fileName && !contract.pdfPath} title="Baixar documento" aria-label={`Baixar documento de ${contract.title}`}><ArrowDownToLine size={15} /></button><Link className="icon-button" to="/contratos/novo" state={{ duplicateContract: contract }} title="Duplicar" aria-label={`Duplicar ${contract.title}`}><Copy size={14} /></Link></div></td>
                </tr>
              ))}
              {!loading && visible.length === 0 && <tr><td className="empty-table" colSpan={7}>Nenhum contrato encontrado com esses filtros.</td></tr>}
              {loading && <tr><td className="empty-table" colSpan={7}>Carregando histórico...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pagination-row"><span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} de ${filtered.length} contratos` : '0 contratos'}</span><div><button className="outline-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {pages}</span><button className="outline-button" type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></div>
      </section>
    </div>
  )
}