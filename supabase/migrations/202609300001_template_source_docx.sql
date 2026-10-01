alter table public.contract_template_versions
  add column if not exists source_docx_path text;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'contract-template-pdfs';

drop policy if exists "template_docx_read_authorized" on storage.objects;
create policy "template_docx_read_authorized" on storage.objects for select to authenticated
using (
  bucket_id = 'contract-template-pdfs'
  and (
    (select public.current_user_is_admin())
    or exists (
      select 1
      from public.contract_template_versions v
      join public.contract_templates t on t.id = v.template_id
      where v.source_docx_path = storage.objects.name
        and t.status = 'active'
    )
  )
);