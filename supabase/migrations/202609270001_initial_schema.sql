create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'broker');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'broker',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'broker'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  address text not null,
  number text not null default '',
  complement text not null default '',
  neighborhood text not null default '',
  city text not null,
  state char(2) not null,
  postal_code text not null default '',
  type text not null,
  area numeric(10, 2),
  bedrooms smallint,
  bathrooms smallint,
  owner_id uuid references public.clients (id),
  notes text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates (id) on delete cascade,
  version text not null,
  content text not null,
  placeholders text[] not null default '{}',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Contrato',
  template_id uuid not null references public.contract_templates (id),
  template_version_id uuid not null references public.contract_template_versions (id),
  client_id uuid not null references public.clients (id),
  property_id uuid not null references public.properties (id),
  created_by uuid not null references public.profiles (id),
  status text not null default 'generating' check (status in ('draft', 'generating', 'generated', 'review', 'signed', 'pdf_failed')),
  fields jsonb not null default '{}',
  rendered_content text not null,
  file_name text,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_fields (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  field_key text not null,
  field_value text not null default '',
  created_at timestamptz not null default now(),
  unique (contract_id, field_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index clients_name_idx on public.clients (name);
create index properties_code_idx on public.properties (code);
create index contract_templates_status_idx on public.contract_templates (status);
create index contract_template_versions_template_idx on public.contract_template_versions (template_id, created_at desc);
create index contracts_created_by_created_at_idx on public.contracts (created_by, created_at desc);
create index contracts_created_at_idx on public.contracts (created_at desc);
create index contracts_client_id_idx on public.contracts (client_id);
create index contracts_property_id_idx on public.contracts (property_id);
create index contract_fields_contract_id_idx on public.contract_fields (contract_id);
create index audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute procedure public.set_updated_at();
create trigger properties_set_updated_at before update on public.properties for each row execute procedure public.set_updated_at();
create trigger templates_set_updated_at before update on public.contract_templates for each row execute procedure public.set_updated_at();
create trigger contracts_set_updated_at before update on public.contracts for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.properties enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_template_versions enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_fields enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_read_self_or_admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy "profiles_admin_manage" on public.profiles for all to authenticated
using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy "clients_read_internal" on public.clients for select to authenticated using (true);
create policy "clients_insert_internal" on public.clients for insert to authenticated with check (created_by = (select auth.uid()));
create policy "clients_update_internal" on public.clients for update to authenticated using (true) with check (true);
create policy "clients_delete_admin" on public.clients for delete to authenticated using ((select public.current_user_is_admin()));

create policy "properties_read_internal" on public.properties for select to authenticated using (true);
create policy "properties_insert_internal" on public.properties for insert to authenticated with check (created_by = (select auth.uid()));
create policy "properties_update_internal" on public.properties for update to authenticated using (true) with check (true);
create policy "properties_delete_admin" on public.properties for delete to authenticated using ((select public.current_user_is_admin()));

create policy "templates_read_active_or_admin" on public.contract_templates for select to authenticated
using (status = 'active' or (select public.current_user_is_admin()));
create policy "templates_admin_manage" on public.contract_templates for all to authenticated
using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "template_versions_read_authorized" on public.contract_template_versions for select to authenticated
using (exists (
  select 1 from public.contract_templates t where t.id = template_id and (t.status = 'active' or (select public.current_user_is_admin()))
));
create policy "template_versions_admin_manage" on public.contract_template_versions for all to authenticated
using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy "contracts_read_owner_or_admin" on public.contracts for select to authenticated
using (created_by = (select auth.uid()) or (select public.current_user_is_admin()));
create policy "contracts_insert_owner" on public.contracts for insert to authenticated
with check (created_by = (select auth.uid()));
create policy "contracts_update_owner_or_admin" on public.contracts for update to authenticated
using ((created_by = (select auth.uid()) and status not in ('signed')) or (select public.current_user_is_admin()))
with check (created_by = (select auth.uid()) or (select public.current_user_is_admin()));
create policy "contracts_delete_admin" on public.contracts for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "contract_fields_read_parent" on public.contract_fields for select to authenticated
using (exists (select 1 from public.contracts c where c.id = contract_id and (c.created_by = (select auth.uid()) or (select public.current_user_is_admin()))));
create policy "contract_fields_insert_parent" on public.contract_fields for insert to authenticated
with check (exists (select 1 from public.contracts c where c.id = contract_id and c.created_by = (select auth.uid())));

create policy "audit_read_owner_or_admin" on public.audit_logs for select to authenticated
using (user_id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy "audit_insert_self" on public.audit_logs for insert to authenticated
with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-pdfs', 'contract-pdfs', false, 15728640, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "contract_pdf_read_owner_or_admin" on storage.objects for select to authenticated
using (bucket_id = 'contract-pdfs' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.current_user_is_admin())));
create policy "contract_pdf_insert_owner" on storage.objects for insert to authenticated
with check (bucket_id = 'contract-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "contract_pdf_delete_owner_or_admin" on storage.objects for delete to authenticated
using (bucket_id = 'contract-pdfs' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.current_user_is_admin())));