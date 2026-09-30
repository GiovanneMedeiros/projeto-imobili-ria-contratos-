import { Building2, ChartNoAxesCombined, ChevronDown, ClipboardList, FilePlus2, FileText, LayoutDashboard, LogOut, NotebookPen, Settings2, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const links = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Imóveis', to: '/imoveis', icon: Building2 },
  { label: 'Clientes', to: '/clientes', icon: UsersRound },
  { label: 'Contratos', to: '/contratos', icon: FileText },
  { label: 'Rascunhos', to: '/rascunhos', icon: NotebookPen },
  { label: 'Modelos', to: '/modelos', icon: ClipboardList, adminOnly: true },
  { label: 'Relatórios', to: '/relatorios', icon: ChartNoAxesCombined },
  { label: 'Configurações', to: '/configuracoes', icon: Settings2 },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  return (
    <aside className="sidebar">
      <NavLink className="sidebar-brand" to="/dashboard" aria-label="Miellis, dashboard">
        <img src="/miellis-logo.png" alt="Imobiliária Miellis" />
      </NavLink>
      <div className="sidebar-caption">GESTÃO INTERNA</div>
      <nav className="side-nav" aria-label="Navegação principal">
        {links.filter((link) => !link.adminOnly || user?.role === 'admin').map(({ label, to, icon: Icon }) => (
          <NavLink className={({ isActive }) => `side-link${isActive ? ' active' : ''}`} to={to} key={to}>
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <NavLink className="sidebar-create" to="/contratos/novo"><FilePlus2 size={17} /> Novo contrato</NavLink>
      <div className="sidebar-profile">
        <span className="profile-avatar">{user?.fullName.slice(0, 1).toUpperCase()}</span>
        <span className="profile-copy"><strong>{user?.fullName}</strong><small>{user?.role === 'admin' ? 'Administrador' : 'Corretor'}</small></span>
        <button className="icon-button logout-button" type="button" onClick={() => void signOut()} aria-label="Sair"><LogOut size={16} /></button>
      </div>
    </aside>
  )
}

export function Topbar({ title, demo }: { title: string; demo: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-title"><span>MIELLIS</span><ChevronDown size={13} /><span className="topbar-current">{title}</span></div>
      <div className="topbar-status">
        {demo && <span className="demo-badge"><i />Demonstração</span>}
        <span className="secure-indicator"><span />Ambiente interno</span>
      </div>
    </header>
  )
}