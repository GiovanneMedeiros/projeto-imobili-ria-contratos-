create table if not exists public.contract_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  template_id uuid references public.contract_templates (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  fields jsonb not null default '{}',
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'pending_approval', 'approved', 'generated', 'pending_signature', 'signed', 'cancelled')),
  percent_complete numeric(5, 2) not null default 0 check (percent_complete between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_drafts_user_updated_idx on public.contract_drafts (user_id, updated_at desc);

drop trigger if exists contract_drafts_set_updated_at on public.contract_drafts;
create trigger contract_drafts_set_updated_at before update on public.contract_drafts for each row execute procedure public.set_updated_at();

alter table public.contract_drafts enable row level security;

drop policy if exists "contract_drafts_read_owner_or_admin" on public.contract_drafts;
create policy "contract_drafts_read_owner_or_admin" on public.contract_drafts for select to authenticated
using (user_id = (select auth.uid()) or (select public.current_user_is_admin()));

drop policy if exists "contract_drafts_insert_owner" on public.contract_drafts;
create policy "contract_drafts_insert_owner" on public.contract_drafts for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "contract_drafts_update_owner" on public.contract_drafts;
create policy "contract_drafts_update_owner" on public.contract_drafts for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "contract_drafts_delete_owner_or_admin" on public.contract_drafts;
create policy "contract_drafts_delete_owner_or_admin" on public.contract_drafts for delete to authenticated
using (user_id = (select auth.uid()) or (select public.current_user_is_admin()));
