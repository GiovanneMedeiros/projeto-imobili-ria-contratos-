alter table public.contract_template_versions
  add column if not exists pdf_fields jsonb not null default '[]'::jsonb;