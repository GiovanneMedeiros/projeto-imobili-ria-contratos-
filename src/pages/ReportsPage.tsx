import { useEffect, useMemo, useState } from 'react'
import { demoMode } from '../lib/supabase'
import { listContracts } from '../services/contracts'
import type { ContractRecord } from '../types/domain'

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getLastMonths(count: number) {
  const current = new Date()
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(current.getFullYear(), current.getMonth() - (count - offset - 1), 1)
    return { key: getMonthKey(date), label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '') }
  })
}

export function ReportsPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [month, setMonth] = useState(getMonthKey(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listContracts().then((items) => { if (active) setContracts(items) }).catch(() => { if (active) setError('Não foi possível carregar os dados do relatório.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const selected = useMemo(() => contracts.filter((contract) => contract.createdAt.slice(0, 7) === month), [contracts, month])
  const months = getLastMonths(6)
  const trend = months.map((item) => ({ ...item, count: contracts.filter((contract) => contract.createdAt.slice(0, 7) === item.key).length }))
  const highest = Math.max(1, ...trend.map((item) => item.count))
  const byType = Object.entries(selected.reduce<Record<string, number>>((counts, contract) => {
    counts[contract.templateName] = (counts[contract.templateName] ?? 0) + 1
    return counts
  }, {})).sort((left, right) => right[1] - left[1])
  const byUser = Object.entries(selected.reduce<Record<string, number>>((counts, contract) => {
    counts[contract.createdBy] = (counts[contract.createdBy] ?? 0) + 1
    return counts
  }, {})).sort((left, right) => right[1] - left[1])

  return <div className="reports-page"><section className="page-heading-row"><div><span className="section-overline">ANÁLISE · OPERAÇÃO</span><h1>Relatórios</h1><p>Volume de documentos gerados pela equipe.</p></div><label className="report-period">Período<input aria-label="Mês do relatório" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></section>
    {demoMode && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>Relatórios calculados sobre registros fictícios e documentos gerados neste navegador.</div>}{error && <div className="inline-alert" role="alert">{error}</div>}
    <div className="report-cards"><article className="report-card"><span>DOCUMENTOS NO PERÍODO</span><strong>{loading ? '—' : selected.length.toLocaleString('pt-BR')}</strong></article><article className="report-card"><span>MODELOS UTILIZADOS</span><strong>{loading ? '—' : new Set(selected.map((item) => item.templateName)).size.toLocaleString('pt-BR')}</strong></article><article className="report-card"><span>COLABORADORES ATIVOS</span><strong>{loading ? '—' : new Set(selected.map((item) => item.createdBy)).size.toLocaleString('pt-BR')}</strong></article></div>
    <div className="report-layout"><section className="report-panel"><h2>Contratos por mês</h2><p>Volume dos últimos seis meses</p>{contracts.length ? <div className="chart-bars" role="img" aria-label="Gráfico de contratos gerados por mês">{trend.map((item) => <div className="chart-column" key={item.key}><strong>{item.count || ''}</strong><i style={{ height: `${Math.max(4, item.count / highest * 116)}px` }} /><span>{item.label}</span></div>)}</div> : <div className="report-empty">Nenhum contrato registrado no período.</div>}</section>
      <section className="report-panel"><h2>Contratos por tipo</h2><p>Distribuição no período selecionado</p>{byType.length ? <div className="report-type-list">{byType.map(([label, count]) => <div className="report-type-row" key={label}><span>{label}</span><strong>{count}</strong><i style={{ width: `${count / Math.max(1, selected.length) * 100}%` }} /></div>)}</div> : <div className="report-empty">Sem documentos para este período.</div>}</section>
      <section className="report-panel report-users"><h2>Contratos por colaborador</h2><p>Volume de documentos por usuário</p>{byUser.length ? <div className="report-type-list">{byUser.map(([label, count]) => <div className="report-type-row" key={label}><span>{label}</span><strong>{count}</strong><i style={{ width: `${count / Math.max(1, selected.length) * 100}%` }} /></div>)}</div> : <div className="report-empty">Sem documentos para este período.</div>}</section>
    </div>
  </div>
}