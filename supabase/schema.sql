-- ============================================================
-- BIGStock Precision — Complete Supabase Schema
-- Run this in the Supabase SQL Editor. It drops and recreates
-- all tables, so it's safe to run on an existing database.
-- ============================================================

-- Drop all tables in reverse dependency order
drop table if exists public.procurement_order_items cascade;
drop table if exists public.procurement_orders cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.activities cascade;
drop table if exists public.audit_mismatches cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.transfers cascade;
drop table if exists public.inventory_transactions cascade;
drop table if exists public.branch_inventory cascade;
drop table if exists public.inventory cascade;
drop table if exists public.branches cascade;
drop table if exists public.profiles cascade;

-- 1. PROFILES (extends Supabase auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'Staff' check (role in ('Admin', 'Branch Manager', 'Staff')),
  assigned_branch text,
  avatar_url text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Staff')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. BRANCHES
create table public.branches (
  id text primary key,
  name text not null,
  location text,
  address text,
  manager text,
  created_at timestamptz not null default now()
);

-- 3. INVENTORY (master item catalog)
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subtext text,
  category text not null,
  sku text not null unique,
  total integer not null default 0,
  unit text not null default 'Units',
  status text not null default 'HEALTHY' check (status in ('REORDER', 'HEALTHY', 'BALANCED')),
  price numeric(10,2) default 0,
  last_audit timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. BRANCH_INVENTORY (per-branch stock levels)
create table public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id) on delete cascade,
  item_id uuid not null references public.inventory(id) on delete cascade,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (branch_id, item_id)
);

-- 5. INVENTORY_TRANSACTIONS (stock movements log)
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('STOCK_IN', 'TRANSFER', 'ADJUSTMENT', 'USAGE')),
  item_id uuid references public.inventory(id) on delete set null,
  item_name text not null,
  quantity integer not null,
  unit text not null default 'Units',
  from_location text,
  to_location text,
  remarks text,
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'PENDING')),
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 6. TRANSFERS (branch-to-branch transfer requests)
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  from_branch_id text not null references public.branches(id),
  to_branch_id text not null references public.branches(id),
  item_id uuid references public.inventory(id) on delete set null,
  item_name text not null,
  quantity integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. AUDIT_LOGS
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  date text not null,
  branch text not null,
  auditor text not null,
  auditor_avatar text,
  items_checked integer not null default 0,
  status text not null,
  approval_status text not null default 'PENDING' check (approval_status in ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by_name text,
  approved_at timestamptz,
  is_recent boolean default false,
  created_at timestamptz not null default now()
);

-- 8. AUDIT_MISMATCHES (child rows for audit logs with mismatches)
create table public.audit_mismatches (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid not null references public.audit_logs(id) on delete cascade,
  item_id uuid references public.inventory(id) on delete set null,
  name text not null,
  sku text not null,
  expected integer not null,
  actual integer not null,
  remark text
);

-- 9. ACTIVITIES (activity feed)
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('audit', 'restock', 'transfer')),
  title text not null,
  location text not null,
  time text not null,
  created_at timestamptz not null default now()
);

-- 10. SUPPLIERS
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

-- 11. ROLE_PERMISSIONS
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  permission_name text not null,
  admin boolean not null default true,
  manager boolean not null default false,
  staff boolean not null default false,
  created_at timestamptz not null default now(),
  unique (permission_name)
);

-- 12. PROCUREMENT_ORDERS
create table public.procurement_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  branch_id text references public.branches(id) on delete set null,
  supplier text not null,
  total_cost numeric(12,2) not null default 0,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED')),
  expected_delivery date,
  notes text,
  payment_status text default 'UNPAID' check (payment_status in ('UNPAID', 'PAYMENT_SUBMITTED', 'PAID')),
  payment_submitted_date timestamptz,
  payment_paid_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. PROCUREMENT_ORDER_ITEMS (line items for POs)
create table public.procurement_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.procurement_orders(id) on delete cascade,
  item_name text not null,
  sku text not null,
  quantity integer not null,
  unit text not null default 'Units',
  unit_price numeric(10,2) not null default 0
);


-- ============================================================
-- ROW LEVEL SECURITY — allow authenticated users full access
-- (Tighten per-role later as needed)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.inventory enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.transfers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_mismatches enable row level security;
alter table public.activities enable row level security;
alter table public.suppliers enable row level security;
alter table public.role_permissions enable row level security;
alter table public.procurement_orders enable row level security;
alter table public.procurement_order_items enable row level security;

-- Policies: authenticated users can read/write all tables
-- (In production, scope these to roles)
create policy "Authenticated users full access" on public.profiles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.branches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.inventory
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.branch_inventory
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.inventory_transactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.transfers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.audit_logs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.audit_mismatches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.suppliers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.role_permissions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.procurement_orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.procurement_order_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
