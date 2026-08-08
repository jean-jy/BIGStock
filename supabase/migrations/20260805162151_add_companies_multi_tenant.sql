-- Companies (business/brand) layer above branches
create table if not exists public.companies (
  id text primary key,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
drop policy if exists "Authenticated users full access" on public.companies;
create policy "Authenticated users full access" on public.companies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into public.companies (id, name, logo_url) values
  ('big-dental','Big Dental Clinic','/logo.png'),
  ('hydralab','Hydralab', null)
on conflict (id) do nothing;

-- Add company_id to company-scoped tables
alter table public.branches           add column if not exists company_id text references public.companies(id);
alter table public.inventory          add column if not exists company_id text references public.companies(id);
alter table public.profiles           add column if not exists company_id text references public.companies(id);
alter table public.audit_logs         add column if not exists company_id text references public.companies(id);
alter table public.activities         add column if not exists company_id text references public.companies(id);
alter table public.suppliers          add column if not exists company_id text references public.companies(id);
alter table public.procurement_orders add column if not exists company_id text references public.companies(id);

-- Backfill everything that exists today to the dental clinic
update public.branches           set company_id='big-dental' where company_id is null;
update public.inventory          set company_id='big-dental' where company_id is null;
update public.profiles           set company_id='big-dental' where company_id is null;
update public.audit_logs         set company_id='big-dental' where company_id is null;
update public.activities         set company_id='big-dental' where company_id is null;
update public.suppliers          set company_id='big-dental' where company_id is null;
update public.procurement_orders set company_id='big-dental' where company_id is null;

-- New rows default to dental unless explicitly set otherwise
alter table public.branches           alter column company_id set default 'big-dental';
alter table public.inventory          alter column company_id set default 'big-dental';
alter table public.profiles           alter column company_id set default 'big-dental';
alter table public.audit_logs         alter column company_id set default 'big-dental';
alter table public.activities         alter column company_id set default 'big-dental';
alter table public.suppliers          alter column company_id set default 'big-dental';
alter table public.procurement_orders alter column company_id set default 'big-dental';

-- Hydralab's own branches
insert into public.branches (id, name, location, company_id) values
  ('Hydralab Setiawalk','Hydralab Setiawalk','Puchong','hydralab'),
  ('Hydralab Damansara','Hydralab Damansara','Damansara','hydralab')
on conflict (id) do nothing;

create index if not exists idx_inventory_company on public.inventory(company_id);
create index if not exists idx_branches_company  on public.branches(company_id);
create index if not exists idx_profiles_company  on public.profiles(company_id);
