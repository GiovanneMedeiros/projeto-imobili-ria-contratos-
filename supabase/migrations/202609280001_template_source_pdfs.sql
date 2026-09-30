alter table public.contract_template_versions
  add column if not exists source_pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-template-pdfs', 'contract-template-pdfs', false, 15728640, array['application/pdf'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "template_pdf_read_authorized" on storage.objects;
create policy "template_pdf_read_authorized" on storage.objects for select to authenticated
using (
  bucket_id = 'contract-template-pdfs'
  and (
    (select public.current_user_is_admin())
    or exists (
      select 1
      from public.contract_template_versions v
      join public.contract_templates t on t.id = v.template_id
      where v.source_pdf_path = storage.objects.name
        and t.status = 'active'
    )
  )
);

drop policy if exists "template_pdf_insert_admin" on storage.objects;
create policy "template_pdf_insert_admin" on storage.objects for insert to authenticated
with check (bucket_id = 'contract-template-pdfs' and (select public.current_user_is_admin()));

drop policy if exists "template_pdf_delete_admin" on storage.objects;
create policy "template_pdf_delete_admin" on storage.objects for delete to authenticated
using (bucket_id = 'contract-template-pdfs' and (select public.current_user_is_admin()));