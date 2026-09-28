import { ArrowDownToLine, ArrowUpRight, Building2, FileText, Plus, UsersRound, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_CONTRACTS, DEMO_DASHBOARD_STATS } from '../data/demo'
import { demoMode, supabase } from '../lib/supabase'
import type { ContractRecord } from '../types/domain'

interface DashboardData {
  contracts: number
  monthContracts: number
  templates: number
  clients: number
  recent: ContractRecord[]
}

const emptyData: DashboardData = { contracts: 0, monthContracts: 0, templates: 0, clients: 0, recent: [] }
const demoData: DashboardData = { ...DEMO_DASHBOARD_STATS, recent: DEMO_CONTRACTS }

async function loadDashboard(): Promise<DashboardData> {
  if (demoMode) return demoData
  if (!supabase) return emptyData

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const [allContracts, monthContracts, templates, clients, recent] = await Promise.all([
    supabase.from('contracts').select('id', { count: 'exact', head: true }),
    supabase.from('contracts').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
    supabase.from('contract_templates').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('contracts').select('id, created_at, status, contract_templates(name), clients(name), properties(address), profiles(full_name)').order('created_at', { ascending: false }).limit(5),
  ])
  const queryError = allContracts.error ?? monthContracts.error ?? templates.error ?? clients.error ?? recent.error
  if (queryError) throw queryError

  return {
    contracts: allContracts.count ?? 0,
    monthContracts: monthContracts.count ?? 0,
    templates: templates.count ?? 0,
    clients: clients.count ?? 0,
    recent: (recent.data ?? []).map((row) => ({
      id: row.id,
      title: `Contrato ${row.id.slice(0, 8).toUpperCase()}`,
      templateName: (row.contract_templates as { name?: string } | null)?.name ?? 'Modelo',
      clientName: (row.clients as { name?: string } | null)?.name ?? 'Cliente',
      propertyAddress: (row.properties as { address?: string } | null)?.address ?? 'Imóvel',
      createdBy: (row.profiles as { full_name?: string } | null)?.full_name ?? 'Equipe Miellis',
      createdAt: row.created_at,
      status: row.status === 'signed' ? 'Assinado' : row.status === 'review' ? 'Em revisão' : 'Gerado',
    })),
  }
}

function MetricCard({ label, value, icon: Icon, note }: { label: string; value: string; icon: LucideIcon; note: string }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} strokeWidth={1.7} /></span></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>(demoMode ? demoData : emptyData)
  const [loading, setLoading] = useState(!demoMode)
  const [error, setError] = useState('')
  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()).toUpperCase()

  useEffect(() => {
    if (demoMode) return
    let active = true
    void loadDashboard().then((value) => {
      if (active) setData(value)
    }).catch(() => {
      if (active) setError('Não foi possível carregar os indicadores. Verifique a configuração do banco e tente novamente.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <div className="dashboard-page">
      <section className="page-heading-row">
        <div>
          <span className="section-overline">{today}</span>
          <h1>Visão geral</h1>
          <p>Acompanhe os documentos e a operação da imobiliária.</p>
        </div>
        <Link className="gold-button new-contract-button" to="/contratos/novo"><Plus size={17} />Novo contrato</Link>
      </section>

      {demoMode && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>Indicadores, clientes, imóveis e contratos exibidos aqui são fictícios e existem apenas para teste.</div>}
      {error && <div className="inline-alert" role="alert">{error}</div>}

      <section className="metrics-grid" aria-label="Indicadores">
        <MetricCard label="CONTRATOS GERADOS" value={loading ? '—' : data.contracts.toLocaleString('pt-BR')} icon={FileText} note="Total registrado" />
        <MetricCard label="NESTE MÊS" value={loading ? '—' : data.monthContracts.toLocaleString('pt-BR')} icon={ArrowDownToLine} note="Gerados no período" />
        <MetricCard label="MODELOS ATIVOS" value={loading ? '—' : data.templates.toLocaleString('pt-BR')} icon={Building2} note={demoMode ? '1 modelo técnico de demonstração' : 'Disponíveis para uso'} />
        <MetricCard label="CLIENTES" value={loading ? '—' : data.clients.toLocaleString('pt-BR')} icon={UsersRound} note="Cadastros na base" />
      </section>

      <section className="table-section">
        <div className="section-heading-row">
          <div><span className="section-overline">ATIVIDADE</span><h2>Contratos recentes</h2></div>
          <Link className="subtle-link" to="/contratos">Ver todos<ArrowUpRight size={15} /></Link>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>CONTRATO</th><th>CLIENTE</th><th>IMÓVEL</th><th>CRIADO POR</th><th>DATA</th><th>STATUS</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {data.recent.map((contract) => (
                <tr key={contract.id}>
                  <td><Link className="table-contract-link" to={`/contratos/${contract.id}`}>{contract.title}</Link><small>{contract.templateName}</small></td>
                  <td>{contract.clientName}</td>
                  <td>{contract.propertyAddress}</td>
                  <td>{contract.createdBy}</td>
                  <td>{formatDate(contract.createdAt)}</td>
                  <td><span className={`status-pill status-${contract.status === 'Assinado' ? 'signed' : contract.status === 'Em revisão' ? 'review' : 'generated'}`}><i />{contract.status}</span></td>
                  <td><Link className="icon-button table-action" to={`/contratos/${contract.id}`} aria-label={`Abrir ${contract.title}`}><ArrowUpRight size={15} /></Link></td>
                </tr>
              ))}
              {!loading && data.recent.length === 0 && <tr><td className="empty-table" colSpan={7}>Ainda não há contratos registrados.</td></tr>}
              {loading && <tr><td className="empty-table" colSpan={7}>Carregando contratos...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}