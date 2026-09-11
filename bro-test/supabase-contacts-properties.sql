-- Bauer Roofing Operations: contact / inquiry / property / job relationships
-- Run once in the Supabase SQL Editor. It preserves every existing inquiry and job.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  display_name text,
  first_name text,
  last_name text,
  spouse_name text,
  phone text,
  phone_secondary text,
  email text,
  notes text,
  legacy_lead_id uuid unique references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  street_address text,
  city text,
  state text,
  zip text,
  normalized_key text unique,
  notes text,
  legacy_lead_id uuid unique references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_properties (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  relationship_type text not null default 'Owner / Contact',
  started_at date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now(),
  unique (contact_id, property_id)
);

alter table public.properties add column if not exists normalized_key text;

alter table public.leads add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.leads add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.jobs add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.jobs add column if not exists property_id uuid references public.properties(id) on delete set null;

create index if not exists contacts_name_idx on public.contacts (lower(last_name), lower(first_name));
create index if not exists contacts_phone_idx on public.contacts (phone);
create index if not exists contacts_email_idx on public.contacts (lower(email));
create index if not exists properties_zip_idx on public.properties (zip);
create unique index if not exists properties_normalized_key_idx on public.properties (normalized_key);
create index if not exists leads_contact_id_idx on public.leads (contact_id);
create index if not exists leads_property_id_idx on public.leads (property_id);
create index if not exists jobs_contact_id_idx on public.jobs (contact_id);
create index if not exists jobs_property_id_idx on public.jobs (property_id);

-- Create one contact per existing inquiry. This intentionally does not merge people
-- merely because they share an address, phone, or name. Those records can be linked
-- after review without risking a false customer match.
insert into public.contacts (display_name, first_name, last_name, spouse_name, phone, phone_secondary, email, notes, legacy_lead_id)
select
  coalesce(nullif(trim(l.homeowner_name), ''), nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''), 'Unnamed contact'),
  l.first_name, l.last_name, l.spouse_name, l.phone, l.phone_secondary, l.email,
  'Created from existing inquiry during Contacts migration.', l.id
from public.leads l
where l.contact_id is null
on conflict (legacy_lead_id) do nothing;

update public.leads l
set contact_id = c.id
from public.contacts c
where l.contact_id is null and c.legacy_lead_id = l.id;

insert into public.properties (street_address, city, state, zip, normalized_key, notes)
select distinct on (lower(regexp_replace(trim(l.street_address), '\s+', ' ', 'g')) || '|' || lower(coalesce(trim(l.city),'')) || '|' || lower(coalesce(trim(l.state),'')) || '|' || coalesce(trim(l.zip),''))
  l.street_address, l.city, l.state, l.zip,
  lower(regexp_replace(trim(l.street_address), '\s+', ' ', 'g')) || '|' || lower(coalesce(trim(l.city),'')) || '|' || lower(coalesce(trim(l.state),'')) || '|' || coalesce(trim(l.zip),''),
  'Created from existing inquiries during Contacts migration.'
from public.leads l
where l.property_id is null and nullif(trim(l.street_address), '') is not null
order by lower(regexp_replace(trim(l.street_address), '\s+', ' ', 'g')) || '|' || lower(coalesce(trim(l.city),'')) || '|' || lower(coalesce(trim(l.state),'')) || '|' || coalesce(trim(l.zip),''), l.created_at
on conflict (normalized_key) do nothing;

update public.leads l
set property_id = p.id
from public.properties p
where l.property_id is null
  and p.normalized_key = lower(regexp_replace(trim(l.street_address), '\s+', ' ', 'g')) || '|' || lower(coalesce(trim(l.city),'')) || '|' || lower(coalesce(trim(l.state),'')) || '|' || coalesce(trim(l.zip),'');

insert into public.contact_properties (contact_id, property_id, relationship_type)
select distinct l.contact_id, l.property_id, 'Owner / Contact'
from public.leads l
where l.contact_id is not null and l.property_id is not null
on conflict (contact_id, property_id) do nothing;

-- Jobs inherit their relationship from their originating inquiry when available.
update public.jobs j
set contact_id = l.contact_id,
    property_id = coalesce(l.property_id, j.property_id)
from public.leads l
where j.lead_id = l.id
  and (j.contact_id is null or j.property_id is null);

update public.jobs j
set contact_id = l.contact_id,
    property_id = coalesce(l.property_id, j.property_id)
from public.leads l
where j.lead_id is null
  and j.lead_number is not null
  and l.lead_number = j.lead_number
  and (j.contact_id is null or j.property_id is null);

alter table public.contacts enable row level security;
alter table public.properties enable row level security;
alter table public.contact_properties enable row level security;

drop policy if exists "Authenticated team can use contacts" on public.contacts;
create policy "Authenticated team can use contacts" on public.contacts for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated team can use properties" on public.properties;
create policy "Authenticated team can use properties" on public.properties for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated team can use contact properties" on public.contact_properties;
create policy "Authenticated team can use contact properties" on public.contact_properties for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.contact_properties to authenticated;

comment on table public.contacts is 'People and organizations, separate from inquiries, properties, and jobs.';
comment on table public.properties is 'Physical locations, which can have different contacts over time.';
comment on table public.contact_properties is 'Time-aware relationships between contacts and properties.';
comment on column public.leads.contact_id is 'The person or organization associated with this individual inquiry.';
comment on column public.leads.property_id is 'The property associated with this individual inquiry.';
