-- Bauer Roofing Operations - structured residential lead intake fields
-- Run once in the Supabase SQL Editor before publishing the matching website release.

alter table public.leads add column if not exists taken_by text;
alter table public.leads add column if not exists subdivision text;
alter table public.leads add column if not exists mailing_street_address text;
alter table public.leads add column if not exists mailing_city text;
alter table public.leads add column if not exists mailing_state text;
alter table public.leads add column if not exists mailing_zip text;
alter table public.leads add column if not exists directions text;
alter table public.leads add column if not exists insurance_related boolean;
alter table public.leads add column if not exists insurance_company text;
alter table public.leads add column if not exists shingle_age text;
alter table public.leads add column if not exists desired_work_timing text;
alter table public.leads add column if not exists roof_layers text;
alter table public.leads add column if not exists current_leak boolean;
alter table public.leads add column if not exists current_leak_location text;
alter table public.leads add column if not exists prior_leak boolean;
alter table public.leads add column if not exists prior_leak_location text;
alter table public.leads add column if not exists home_type text;
alter table public.leads add column if not exists roof_pitch text;
alter table public.leads add column if not exists payment_plan text;
alter table public.leads add column if not exists referral_category text;
alter table public.leads add column if not exists referral_detail text;
alter table public.leads add column if not exists angi_original_data jsonb not null default '{}'::jsonb;

alter table public.prospects add column if not exists angi_original_data jsonb not null default '{}'::jsonb;

comment on column public.leads.angi_original_data is 'Original source values supplied by Angi; user-entered lead answers are stored separately.';
comment on column public.prospects.angi_original_data is 'Original source values supplied by Angi, keyed by the headings in the imported file.';

-- Preserve the Angi values already stored in structured prospect columns.
update public.prospects
set angi_original_data = jsonb_strip_nulls(jsonb_build_object(
  'Angi lead number', source_reference,
  'Angi account', source_account,
  'Lead date', received_at,
  'Lead status', source_status,
  'Lead type', source_lead_type,
  'Project description', source_description,
  'Lead fee', source_fee,
  'Customer name', customer_name,
  'Customer address', street_address,
  'City', city,
  'State', state,
  'Zip Code', zip,
  'Phone', phone,
  'Email', email
))
where (
  lower(coalesce(source, '')) like '%angi%'
  or lower(coalesce(source_account, '')) like '%angi%'
  or lower(coalesce(import_source, '')) like '%angi%'
)
and angi_original_data = '{}'::jsonb;

-- Copy the retained Angi source information to leads already promoted from prospects.
update public.leads l
set angi_original_data = p.angi_original_data
from public.prospects p
where l.prospect_id = p.id
  and l.angi_original_data = '{}'::jsonb
  and p.angi_original_data <> '{}'::jsonb;
