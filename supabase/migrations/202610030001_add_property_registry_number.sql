alter table public.properties
  add column if not exists registry_number text not null default '';