alter table public.contracts drop constraint if exists contracts_status_check;

update public.contracts set status = 'in_review' where status = 'review';

alter table public.contracts add constraint contracts_status_check check (status in (
  'draft',
  'in_review',
  'pending_approval',
  'approved',
  'generating',
  'generated',
  'pending_signature',
  'signed',
  'cancelled',
  'pdf_failed'
));
