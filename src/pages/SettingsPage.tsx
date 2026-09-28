import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { demoMode } from '../lib/supabase'
import { listTeamMembers, updateTeamRole, type TeamMember } from '../services/users'
import type { UserRole } from '../types/domain'

export function SettingsPage() {
  const { user, demo } = useAuth()
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const supabaseReady = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  useEffect(() => {
    if (demoMode || user?.role !== 'admin') return
    setLoading(true)
    let active = true
    void listTeamMembers().then((members) => { if (active) setTeam(members) }).catch(() => { if (active) setError('Não foi possível carregar a equipe. Verifique as permissões e a migração do banco.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.role])

  async function changeRole(member: TeamMember, role: UserRole) {
    if (!user) return
    setError('')
    setMessage('')
    try {
      await updateTeamRole(member.id, role, user.id)
      setTeam((current) => current.map((item) => item.id === member.id ? { ...item, role } : item))
      setMessage(`Permissão de ${member.fullName} atualizada.`)
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Não foi possível atualizar a permissão.')
    }
  }

  return <div className="settings-page"><section className="page-heading-row"><div><span className="section-overline">SISTEMA · ADMINISTRAÇÃO</span><h1>Configurações</h1><p>Conexões do sistema e permissões da equipe.</p></div></section>
    {demo && <div className="demo-warning"><span className="demo-badge"><i />DEMONSTRAÇÃO</span>As alterações e o acesso apresentados são locais e fictícios.</div>}
    <section className="settings-panel"><h2>Conexões</h2><div className="settings-row"><div><strong>Modo de execução</strong><small>{demo ? 'Dados locais de demonstração' : 'Ambiente integrado'}</small></div><span className={`status-pill ${demo ? 'status-review' : 'status-generated'}`}><i />{demo ? 'DEMO' : 'PRODUÇÃO'}</span></div><div className="settings-row"><div><strong>Supabase Auth e banco</strong><small>{supabaseReady ? import.meta.env.VITE_SUPABASE_URL : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY'}</small></div><span className={`status-pill ${supabaseReady ? 'status-generated' : 'status-inactive'}`}><i />{supabaseReady ? 'Configurado' : 'Pendente'}</span></div><div className="settings-row"><div><strong>Armazenamento de PDF</strong><small>Bucket privado contract-pdfs · acesso assinado por 60 segundos</small></div><span className={`status-pill ${supabaseReady ? 'status-generated' : 'status-inactive'}`}><i />{supabaseReady ? 'Configurável' : 'Pendente'}</span></div><div className="settings-row"><div><strong>API interna</strong><small>Express · health check em /api/health</small></div><code>localhost:3333</code></div></section>
    <section className="settings-panel team-panel"><header><div><h2>Equipe e permissões</h2><p>Administradores configuram convites no Supabase Auth. Novos perfis começam como corretor.</p></div></header>
      {user?.role === 'admin' && !demo && <div className="team-table-wrap"><table className="data-table"><thead><tr><th>NOME</th><th>FUNÇÃO</th><th>ACESSO</th><th>CADASTRADO</th></tr></thead><tbody>{team.map((member) => <tr key={member.id}><td>{member.fullName}{member.id === user.id && <small>Sua conta</small>}</td><td><select className="role-select" aria-label={`Função de ${member.fullName}`} value={member.role} onChange={(event) => void changeRole(member, event.target.value as UserRole)}><option value="broker">Corretor</option><option value="admin">Administrador</option></select></td><td>{member.role === 'admin' ? 'Modelos e equipe' : 'Contratos e cadastros'}</td><td>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(member.createdAt))}</td></tr>)}{!loading && team.length === 0 && <tr><td colSpan={4} className="empty-table">Nenhum perfil encontrado.</td></tr>}{loading && <tr><td colSpan={4} className="empty-table">Carregando equipe...</td></tr>}</tbody></table></div>}
      {(user?.role !== 'admin' || demo) && <div className="settings-notice">{demo ? 'A demonstração usa uma conta administradora local. Nenhum usuário real é consultado.' : 'A gestão de funções está disponível apenas para administradores.'}</div>}
      {message && <p className="settings-success" role="status">{message}</p>}{error && <div className="inline-alert" role="alert">{error}</div>}
    </section>
    <section className="settings-panel"><h2>Execução local</h2><div className="settings-row"><div><strong>Versão da interface</strong><small>React · TypeScript · Vite · Tailwind CSS</small></div><code>Fase 1</code></div><div className="settings-row"><div><strong>Conta conectada</strong><small>{user?.fullName} · {user?.role === 'admin' ? 'Administrador' : 'Corretor'}</small></div><span className="status-pill status-generated"><i />Interno</span></div><p className="settings-help">Nunca use o modo de demonstração com documentos ou dados reais. Configure o Supabase, aplique a migração e desative VITE_DEMO_MODE para liberar o ambiente interno.</p></section>
  </div>
}