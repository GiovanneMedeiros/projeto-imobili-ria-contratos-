import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { demo, ready, user, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'

  if (ready && user) return <Navigate to={destination} replace />

  async function authenticate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setBusy(true)
    setMessage('')
    const error = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setMessage(error)
    else navigate(destination, { replace: true })
  }

  return (
    <main className="login-layout">
      <section className="login-brand-panel" aria-label="Imobiliária Miellis">
        <div className="login-brand-top"><img src="/miellis-logo.png" alt="Imobiliária Miellis" /></div>
        <div className="login-brand-copy">
          <span className="gold-rule" />
          <span className="login-overline">PLATAFORMA INTERNA</span>
          <h1>Gerador de<br />Contratos</h1>
          <p>Documentos imobiliários padronizados, com a confiança e o cuidado da Miellis.</p>
        </div>
        <div className="login-brand-footer"><span>VIAMÃO · RIO GRANDE DO SUL</span><span>© MIELLIS</span></div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <span className="login-mobile-brand"><img src="/miellis-logo.png" alt="Imobiliária Miellis" /></span>
          <span className="section-overline">ACESSO RESTRITO</span>
          <h2>Boas-vindas</h2>
          <p className="login-subtitle">Entre com suas credenciais corporativas.</p>
          <form className="login-form" onSubmit={(event) => void authenticate(event)}>
            <label htmlFor="email">E-mail</label>
            <span className="login-input-wrap"><Mail size={16} /><input id="email" type="email" autoComplete="username" placeholder="nome@miellis.com.br" value={email} onChange={(event) => setEmail(event.target.value)} required /></span>
            <label htmlFor="password">Senha</label>
            <span className="login-input-wrap"><LockKeyhole size={16} /><input id="password" type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required /></span>
            {message && <p className="form-message" role="alert">{demo ? message : 'Não foi possível entrar. Confira seu e-mail e senha.'}</p>}
            <button className="gold-button login-submit" type="submit" disabled={busy || !ready}>
              {busy ? 'Entrando...' : 'Entrar'}<ArrowRight size={16} />
            </button>
          </form>
          {demo && (
            <div className="demo-login">
              <span className="demo-badge"><i />AMBIENTE DE TESTE</span>
              <p>Acesso temporário com dados fictícios. Não use informações reais neste modo.</p>
              <button className="outline-button" type="button" disabled={busy} onClick={() => void authenticate()}>
                Acessar demonstração
              </button>
            </div>
          )}
          {!demo && !import.meta.env.VITE_SUPABASE_URL && <p className="setup-message">O acesso será habilitado após configurar o Supabase no arquivo de ambiente.</p>}
          <p className="login-security">Uso exclusivo de colaboradores da Imobiliária Miellis.</p>
        </div>
      </section>
    </main>
  )
}