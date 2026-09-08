-- Bauer Roofing Operations: MarketSharp archive staging tables
-- Run once in the Supabase SQL Editor before the first MarketSharp archive import.
-- These tables preserve the backup separately and do not alter working leads or jobs.

create table if not exists public.marketsharp_contacts (
  marketsharp_contact_id text primary key,
  first_name text,
  last_name text,
  business_name text,
  primary_email text,
  phone text,
  phone_secondary text,
  address_line_one text,
  address_line_two text,
  city text,
  state text,
  zip text,
  do_not_mail boolean not null default false,
  do_not_email boolean not null default false,
  do_not_call boolean not null default false,
  do_not_text boolean not null default false,
  raw_data jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null default auth.uid(),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketsharp_inquiries (
  marketsharp_lead_id text primary key,
  marketsharp_contact_id text,
  bauer_lead_number text,
  operations_lead_id uuid references public.leads(id) on delete set null,
  migration_class text not null,
  source text,
  description text,
  notes text,
  inquiry_date_text text,
  property_address text,
  property_address_line_two text,
  city text,
  state text,
  zip text,
  appointment_count integer not null default 0,
  job_count integer not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null default auth.uid(),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketsharp_appointments (
  marketsharp_appointment_id text primary key,
  marketsharp_lead_id text,
  appointment_date_text text,
  appointment_set_date_text text,
  appointment_type text,
  appointment_result text,
  salesperson_employee_id text,
  is_active boolean not null default true,
  raw_data jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null default auth.uid(),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketsharp_jobs (
  marketsharp_job_id text primary key,
  marketsharp_lead_id text,
  marketsharp_contact_id text,
  job_number text,
  job_name text,
  job_description text,
  job_type text,
  job_status text,
  address_line_one text,
  address_line_two text,
  city text,
  state text,
  zip text,
  start_date_text text,
  sale_date_text text,
  notes text,
  is_active boolean not null default true,
  raw_data jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null default auth.uid(),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketsharp_contacts_name_idx on public.marketsharp_contacts (lower(last_name), lower(first_name));
create index if not exists marketsharp_contacts_phone_idx on public.marketsharp_contacts (phone);
create index if not exists marketsharp_contacts_zip_idx on public.marketsharp_contacts (zip);
create index if not exists marketsharp_inquiries_contact_idx on public.marketsharp_inquiries (marketsharp_contact_id);
create index if not exists marketsharp_inquiries_bauer_number_idx on public.marketsharp_inquiries (bauer_lead_number);
create index if not exists marketsharp_inquiries_operations_idx on public.marketsharp_inquiries (operations_lead_id);
create index if not exists marketsharp_appointments_lead_idx on public.marketsharp_appointments (marketsharp_lead_id);
create index if not exists marketsharp_jobs_lead_idx on public.marketsharp_jobs (marketsharp_lead_id);
create index if not exists marketsharp_jobs_contact_idx on public.marketsharp_jobs (marketsharp_contact_id);
create index if not exists marketsharp_jobs_number_idx on public.marketsharp_jobs (job_number);

alter table public.marketsharp_contacts enable row level security;
alter table public.marketsharp_inquiries enable row level security;
alter table public.marketsharp_appointments enable row level security;
alter table public.marketsharp_jobs enable row level security;

drop policy if exists "Importer can use own MarketSharp contacts" on public.marketsharp_contacts;
create policy "Importer can use own MarketSharp contacts" on public.marketsharp_contacts for all to authenticated using (imported_by = auth.uid()) with check (imported_by = auth.uid());
drop policy if exists "Importer can use own MarketSharp inquiries" on public.marketsharp_inquiries;
create policy "Importer can use own MarketSharp inquiries" on public.marketsharp_inquiries for all to authenticated using (imported_by = auth.uid()) with check (imported_by = auth.uid());
drop policy if exists "Importer can use own MarketSharp appointments" on public.marketsharp_appointments;
create policy "Importer can use own MarketSharp appointments" on public.marketsharp_appointments for all to authenticated using (imported_by = auth.uid()) with check (imported_by = auth.uid());
drop policy if exists "Importer can use own MarketSharp jobs" on public.marketsharp_jobs;
create policy "Importer can use own MarketSharp jobs" on public.marketsharp_jobs for all to authenticated using (imported_by = auth.uid()) with check (imported_by = auth.uid());

grant select, insert, update, delete on public.marketsharp_contacts to authenticated;
grant select, insert, update, delete on public.marketsharp_inquiries to authenticated;
grant select, insert, update, delete on public.marketsharp_appointments to authenticated;
grant select, insert, update, delete on public.marketsharp_jobs to authenticated;

comment on table public.marketsharp_contacts is 'Read-only migration archive of MarketSharp contact records.';
comment on table public.marketsharp_inquiries is 'Read-only migration archive of MarketSharp inquiries, including the Bauer lead-number crosswalk.';
comment on table public.marketsharp_appointments is 'Read-only migration archive of MarketSharp appointment history.';
comment on table public.marketsharp_jobs is 'Read-only migration archive of MarketSharp job history.';
