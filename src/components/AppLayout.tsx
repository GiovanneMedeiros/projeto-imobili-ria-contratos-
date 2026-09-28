import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, Topbar } from './Sidebar'
import { useAuth } from '../auth/AuthContext'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Visão geral',
  '/imoveis': 'Imóveis',
  '/clientes': 'Clientes',
  '/contratos': 'Contratos',
  '/contratos/novo': 'Novo contrato',
  '/modelos': 'Modelos de contrato',
  '/modelos/novo': 'Novo modelo',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
}

export function AppLayout() {
  const { demo } = useAuth()
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? (pathname.startsWith('/contratos/') ? 'Detalhes do contrato' : 'Miellis')
  return (
    <div className="app-frame">
      <Sidebar />
      <div className="app-main">
        <Topbar title={title} demo={demo} />
        <main className="page-container"><Outlet /></main>
      </div>
    </div>
  )
}