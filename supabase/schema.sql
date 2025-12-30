-- Supabase schema for Sreenivasam Construction Projects
-- Run in the SQL editor or with supabase CLI

-- Enable uuid generation
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  status text,
  project_total_sqft numeric,
  project_docs_folder_url text,
  elevation_image_url text,
  total_contributions numeric(14,2) default 0,
  total_expenses numeric(14,2) default 0,
  handler_reimbursement_due numeric(14,2) default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- Contractor agreements
create table if not exists public.project_contractors (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contractor_name text not null,
  type text not null check (type in ('fixed','per_sqft')),
  fixed_amount numeric,
  rate_per_sqft numeric,
  total_sqft numeric,
  calculated_total numeric not null default 0,
  already_paid numeric not null default 0,
  remaining_amount numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_contractors_project on public.project_contractors (project_id);

-- Safe non-destructive migrations (for existing DBs)
alter table if exists public.projects add column if not exists project_total_sqft numeric;
alter table if exists public.projects add column if not exists project_docs_folder_url text;
alter table if exists public.projects add column if not exists elevation_image_url text;

-- Project Code (quick open)
alter table if exists public.projects add column if not exists project_code text;

-- Backfill codes for any existing rows (and for rows created before this migration)
update public.projects
set project_code = upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8))
where project_code is null or trim(project_code) = '';

-- Uniqueness constraint (case-insensitive via upper() convention in code)
create unique index if not exists projects_project_code_unique on public.projects (project_code);

alter table if exists public.partner_contributions
  add column if not exists contractor_id uuid references public.project_contractors (id) on delete set null;

alter table if exists public.expenses
  add column if not exists contractor_id uuid references public.project_contractors (id) on delete set null;

alter table if exists public.project_contractors add column if not exists calculated_total numeric not null default 0;
alter table if exists public.project_contractors add column if not exists already_paid numeric not null default 0;
alter table if exists public.project_contractors add column if not exists remaining_amount numeric not null default 0;

-- Partner contributions
create table if not exists public.partner_contributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contractor_id uuid references public.project_contractors (id) on delete set null,
  partner_name text not null,
  partner_email text,
  amount numeric(14,2) not null,
  contribution_type text not null default 'account_credit',
  mode text,
  date date not null,
  notes text,
  vendor_name text,
  purpose text,
  proof text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_partner_contributions_project on public.partner_contributions (project_id);

-- Expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contractor_id uuid references public.project_contractors (id) on delete set null,
  title text not null,
  category text,
  amount numeric(14,2) not null,
  date date not null,
  paid_by text,
  vendor_name text,
  notes text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_expenses_project on public.expenses (project_id);

-- Flats
create table if not exists public.flats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  flat_no text not null,
  buyer_name text,
  buyer_email text,
  total_cost numeric(14,2) not null,
  status text default 'available'
);
create index if not exists idx_flats_project on public.flats (project_id);

-- Flat payments / installments
create table if not exists public.flat_payments (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  amount numeric(14,2) not null,
  date date not null,
  mode text,
  notes text
);
create index if not exists idx_flat_payments_flat on public.flat_payments (flat_id);

-- Transaction audit logs
create table if not exists public.transaction_audit_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  project_id uuid references public.projects (id) on delete cascade,
  changed_by uuid references auth.users (id),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_project on public.transaction_audit_logs (project_id);
create index if not exists idx_audit_logs_tx on public.transaction_audit_logs (transaction_id);

-- Global settings (key/value)
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Enable RLS and allow authenticated users CRUD (service role bypasses)
alter table public.projects enable row level security;
alter table public.partner_contributions enable row level security;
alter table public.expenses enable row level security;
alter table public.project_contractors enable row level security;
alter table public.flats enable row level security;
alter table public.flat_payments enable row level security;
alter table public.transaction_audit_logs enable row level security;
alter table public.settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects' and policyname = 'projects authenticated access'
  ) then
    create policy "projects authenticated access" on public.projects
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_contractors' and policyname = 'project contractors authenticated access'
  ) then
    create policy "project contractors authenticated access" on public.project_contractors
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'settings' and policyname = 'settings authenticated access'
  ) then
    create policy "settings authenticated access" on public.settings
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'partner_contributions' and policyname = 'contributions authenticated access'
  ) then
    create policy "contributions authenticated access" on public.partner_contributions
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'expenses' and policyname = 'expenses authenticated access'
  ) then
    create policy "expenses authenticated access" on public.expenses
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'flats' and policyname = 'flats authenticated access'
  ) then
    create policy "flats authenticated access" on public.flats
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'flat_payments' and policyname = 'flat payments authenticated access'
  ) then
    create policy "flat payments authenticated access" on public.flat_payments
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transaction_audit_logs' and policyname = 'audit logs authenticated access'
  ) then
    create policy "audit logs authenticated access" on public.transaction_audit_logs
      for select using (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transaction_audit_logs' and policyname = 'audit logs authenticated write'
  ) then
    create policy "audit logs authenticated write" on public.transaction_audit_logs
      for insert with check (auth.role() = 'authenticated');
  end if;
end $$;

comment on table public.partner_contributions is 'Partner contributions including optional email for notifications';
comment on table public.transaction_audit_logs is 'Tracks old/new values for changes to contributions, expenses, and installments';

-- Force PostgREST schema reload (fixes schema cache error)
select pg_notify('pgrst', 'reload schema');
