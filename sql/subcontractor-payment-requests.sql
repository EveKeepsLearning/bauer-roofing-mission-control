begin;

create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default bro_private.workspace_owner(),
  company_name text not null check (length(trim(company_name)) between 1 and 200),
  street_address text,
  city text,
  state text,
  zip text,
  contact_name text,
  retainage_percent numeric(5,2) not null default 0 check (retainage_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subcontractors_owner_company_unique
  on public.subcontractors (owner_id, lower(company_name));

create table if not exists public.subcontractor_payment_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default bro_private.workspace_owner(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete restrict,
  requisition_number integer not null check (requisition_number > 0),
  payment_date date not null,
  work_date date not null,
  subcontractor_name_snapshot text not null,
  subcontractor_street_snapshot text,
  subcontractor_city_snapshot text,
  subcontractor_state_snapshot text,
  subcontractor_zip_snapshot text,
  subcontractor_contact_snapshot text,
  retainage_percent numeric(5,2) not null default 0 check (retainage_percent between 0 and 100),
  job_number_snapshot text,
  customer_name_snapshot text,
  property_address_snapshot text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, subcontractor_id, requisition_number)
);

create index if not exists subcontractor_payment_requests_job_idx
  on public.subcontractor_payment_requests (job_id, created_at desc);
create index if not exists subcontractor_payment_requests_sub_idx
  on public.subcontractor_payment_requests (subcontractor_id, payment_date desc);

create table if not exists public.subcontractor_payment_request_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default bro_private.workspace_owner(),
  payment_request_id uuid not null references public.subcontractor_payment_requests(id) on delete cascade,
  sort_order integer not null default 1 check (sort_order > 0),
  description text not null check (length(trim(description)) between 1 and 1000),
  contract_amount numeric(12,2) not null default 0 check (contract_amount >= 0),
  requested_amount numeric(12,2) not null default 0 check (requested_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_request_id, sort_order)
);

create index if not exists subcontractor_payment_request_items_request_idx
  on public.subcontractor_payment_request_items (payment_request_id, sort_order);

alter table public.subcontractors enable row level security;
alter table public.subcontractor_payment_requests enable row level security;
alter table public.subcontractor_payment_request_items enable row level security;

drop policy if exists subcontractors_team_all on public.subcontractors;
create policy subcontractors_team_all on public.subcontractors
  for all to authenticated
  using (owner_id = (select bro_private.workspace_owner()))
  with check (owner_id = (select bro_private.workspace_owner()));

drop policy if exists subcontractor_payment_requests_team_all on public.subcontractor_payment_requests;
create policy subcontractor_payment_requests_team_all on public.subcontractor_payment_requests
  for all to authenticated
  using (owner_id = (select bro_private.workspace_owner()))
  with check (owner_id = (select bro_private.workspace_owner()));

drop policy if exists subcontractor_payment_request_items_team_all on public.subcontractor_payment_request_items;
create policy subcontractor_payment_request_items_team_all on public.subcontractor_payment_request_items
  for all to authenticated
  using (owner_id = (select bro_private.workspace_owner()))
  with check (owner_id = (select bro_private.workspace_owner()));

revoke all on public.subcontractors from public, anon;
revoke all on public.subcontractor_payment_requests from public, anon;
revoke all on public.subcontractor_payment_request_items from public, anon;
grant select, insert, update, delete on public.subcontractors to authenticated;
grant select, insert, update, delete on public.subcontractor_payment_requests to authenticated;
grant select, insert, update, delete on public.subcontractor_payment_request_items to authenticated;

insert into public.subcontractors
  (owner_id, company_name, street_address, city, state, zip, contact_name, retainage_percent)
values
  ('256b9356-8bab-42e1-9b65-314075f8426c','Alpha & Omega Construction','955 E Main St Suite 105','Lexington','SC','29072','Alex Aleman',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Bauer Roofing','1430 Congaree Dr','West Columbia','SC','29172','Jonathan Bauer',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Craft Construction','197 Pond Oak Ln','Columbia','SC','29212','Casey Craft',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Mayers Seamless Gutters','2428 Sharpes Hill Rd','Gaston','SC','29053','Mark Mayers',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Carolina Consultin Group LLC','201 Pineville Rd','Spartanburg','SC','29307','Patrick O''Shields',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Advanced Custom Constructio, LLC','1327 Hayes Crossing Rd','Gilbert','SC','29054','Chad Baker',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Villarreal,Juan','Lot 8 Sandy Haven Dr','Elgin','SC','29045','Juan Villarreal',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Smith Vinyl Siding','P O Box 84744','Lexington','SC','29073','Brian Smith',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Forrester Painting','564 James Dunbar Rd','Pelion','SC','29123','Dakota Forrester',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Erick Salomon','593 Dawn Dr','West Columbia','SC','29170','Eric Salomon',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Michael Luna','104 Walnut St','Cary','NC','27511','Michael Luna',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Zoylo Oporto','233 State Pond Rd','Gaston','SC','29053','Zoylo Oporto',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','South Crescent Construction','157 Wando Cir','Lexington','SC','29072','Saul Salazar',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Dominion Roofing LLC','231 Savannah Hills Dr','Lexington','SC','29072','Rodrigo Mera',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Hernandez Roofing & Construction','600 Ermine Rd Lot 69','West Columbia',null,null,'Rigo Mera',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','River City Investments','P O Box 234','Ballentine','SC','29002','David Dreher',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Forte Construction Group, LLC','1507 Ridgewood Rd','Elgin','SC','29045','Hector Cervantes',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','River City Renovations, LLC','P O Box 234','Ballentine','SC','29002','David Dreher',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Tito''s Painting','1561 Old Stagecoach Rd','Camden','SC','29020','Fabian Martinez',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Old South Iron Works','2508 Kennerley Rd','Irmo','SC','29063','Van Safreit',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Resilient Roofing & Repair','441 Northcutt Rd','Pelion','SC','29123','Mike Coward',0),
  ('256b9356-8bab-42e1-9b65-314075f8426c','Pro Quality Roofing','1509 Ross St','West Columbia','SC',null,'Edgar Vasquez Mata',0)
on conflict (owner_id, lower(company_name)) do update set
  street_address = excluded.street_address,
  city = excluded.city,
  state = excluded.state,
  zip = excluded.zip,
  contact_name = excluded.contact_name,
  retainage_percent = excluded.retainage_percent,
  updated_at = now();

commit;
