import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/domain'

export interface TeamMember {
  id: string
  fullName: string
  email?: string
  role: UserRole
  createdAt: string
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, created_at').order('full_name')
  if (error) throw error
  return (data ?? []).map((member) => ({ id: member.id, fullName: member.full_name, role: member.role, createdAt: member.created_at }))
}

export async function updateTeamRole(id: string, role: UserRole, actorId: string) {
  if (!supabase) throw new Error('Configure o Supabase antes de alterar permissões.')
  if (id === actorId && role !== 'admin') {
    const { count, error: countError } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
    if (countError) throw countError
    if ((count ?? 0) <= 1) throw new Error('Não é possível remover a função do único administrador.')
  }
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw error
  await supabase.from('audit_logs').insert({ user_id: actorId, action: 'user.role_updated', entity_type: 'profile', entity_id: id, metadata: { role } })
}