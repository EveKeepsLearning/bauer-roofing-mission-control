-- Bauer Roofing Operations: MarketSharp review and promotion links
-- Run once after supabase-marketsharp-archive.sql.
-- This adds resumable links from the preserved MarketSharp archive into working Operations records.

alter table public.marketsharp_contacts
  add column if not exists operations_contact_id uuid references public.contacts(id) on delete set null;

alter table public.marketsharp_inquiries
  add column if not exists promotion_status text not null default 'Not Reviewed',
  add column if not exists promoted_at timestamptz,
  add column if not exists promotion_note text;

alter table public.marketsharp_jobs
  add column if not exists operations_job_id uuid references public.jobs(id) on delete set null;

create index if not exists marketsharp_contacts_operations_contact_idx
  on public.marketsharp_contacts (operations_contact_id);
create index if not exists marketsharp_inquiries_promotion_status_idx
  on public.marketsharp_inquiries (promotion_status);
create index if not exists marketsharp_jobs_operations_job_idx
  on public.marketsharp_jobs (operations_job_id);

comment on column public.marketsharp_contacts.operations_contact_id is
  'Working Bauer Roofing Operations contact created or linked during MarketSharp review.';
comment on column public.marketsharp_inquiries.promotion_status is
  'Review decision for moving this preserved MarketSharp inquiry into working Operations.';
comment on column public.marketsharp_inquiries.promoted_at is
  'When this MarketSharp inquiry was linked to or created in working Operations.';
comment on column public.marketsharp_jobs.operations_job_id is
  'Working Operations job linked during the later MarketSharp job migration stage.';
