import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NewContractPage } from './pages/NewContractPage'
import { ContractsPage } from './pages/ContractsPage'
import { ContractDetailsPage } from './pages/ContractDetailsPage'
import { TemplateEditorPage } from './pages/TemplateEditorPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { ClientsPage, PropertiesPage } from './pages/RecordsPages'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { DraftsPage } from './pages/DraftsPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="imoveis" element={<PropertiesPage />} />
              <Route path="clientes" element={<ClientsPage />} />
              <Route path="contratos" element={<ContractsPage />} />
              <Route path="rascunhos" element={<DraftsPage />} />
              <Route path="contratos/novo" element={<NewContractPage />} />
              <Route path="contratos/:id" element={<ContractDetailsPage />} />
              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="modelos" element={<TemplatesPage />} />
                <Route path="modelos/novo" element={<TemplateEditorPage />} />
                <Route path="modelos/:id/editar" element={<TemplateEditorPage />} />
              </Route>
              <Route path="relatorios" element={<ReportsPage />} />
              <Route path="configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}