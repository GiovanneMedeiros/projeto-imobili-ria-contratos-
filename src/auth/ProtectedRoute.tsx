import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="route-loading" role="status">Carregando acesso...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet />
}