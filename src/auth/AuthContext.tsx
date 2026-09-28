import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppUser } from '../types/domain'
import { demoMode, supabase } from '../lib/supabase'

interface AuthContextValue {
  user: AppUser | null
  ready: boolean
  demo: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const DEMO_SESSION_KEY = 'miellis-demo-session'
const AuthContext = createContext<AuthContextValue | null>(null)

function mapSession(session: Session | null): AppUser | null {
  if (!session?.user) return null
  const role = session.user.app_metadata.role === 'admin' ? 'admin' : 'broker'
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    fullName: session.user.user_metadata.full_name ?? session.user.email ?? 'Colaborador Miellis',
    role,
  }
}

async function resolveProfile(session: Session | null) {
  const user = mapSession(session)
  if (!user || !supabase) return user
  const { data } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
  if (!data) return user
  return {
    ...user,
    fullName: data.full_name || user.fullName,
    role: data.role === 'admin' ? 'admin' as const : 'broker' as const,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (demoMode) {
      if (sessionStorage.getItem(DEMO_SESSION_KEY) === 'active') {
        setUser({ id: 'demo-admin', email: 'demonstracao@miellis.example.invalid', fullName: 'Acesso de demonstração', role: 'admin' })
      }
      setReady(true)
      return
    }

    if (!supabase) {
      setReady(true)
      return
    }

    let mounted = true
    void supabase.auth.getSession().then(async ({ data }) => {
      const profile = await resolveProfile(data.session)
      if (mounted) {
        setUser(profile)
        setReady(true)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveProfile(session).then((profile) => {
        if (mounted) {
          setUser(profile)
          setReady(true)
        }
      })
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    if (demoMode) {
      sessionStorage.setItem(DEMO_SESSION_KEY, 'active')
      setUser({ id: 'demo-admin', email: email || 'demonstracao@miellis.example.invalid', fullName: 'Acesso de demonstração', role: 'admin' })
      return null
    }
    if (!supabase) return 'Configure a conexão com o Supabase para entrar.'
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    if (data.user) await supabase.from('audit_logs').insert({ user_id: data.user.id, action: 'auth.login', entity_type: 'profile', entity_id: data.user.id })
    return null
  }

  async function signOut() {
    if (demoMode) sessionStorage.removeItem(DEMO_SESSION_KEY)
    else if (supabase) await supabase.auth.signOut()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, ready, demo: demoMode, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa ser usado dentro de AuthProvider')
  return context
}