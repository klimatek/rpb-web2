-- ============================================
-- RPB CALCULATOR - COMPLETE SCHEMA
-- Run this in Supabase SQL Editor (project baru)
-- ============================================

-- 1. Enable pgcrypto extension
create extension if not exists pgcrypto;

-- 2. Helper function for updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. USER PROFILES TABLE
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null default '',
  full_name text not null default '',
  phone_number text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

-- 4. Trigger: Auto-create user profile on auth signup
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- 5. Admin check function
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid() and up.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- 6. RPB SETTINGS TABLE
create table if not exists public.rpb_settings (
  id integer primary key check (id = 1),
  usd_to_idr numeric(18, 4) not null default 16900,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rpb_settings_updated_at on public.rpb_settings;
create trigger trg_rpb_settings_updated_at
before update on public.rpb_settings
for each row execute function public.set_updated_at();

-- 7. PROFILE ITEMS MASTER TABLE (Panel, Corner, dll)
create table if not exists public.rpb_profile_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null default 'pc',
  sort_order integer not null default 0,
  formula_expr text not null default '0',
  price_idr_30 numeric(18, 2) not null default 0,
  price_idr_45 numeric(18, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rpb_profile_items_updated_at on public.rpb_profile_items;
create trigger trg_rpb_profile_items_updated_at
before update on public.rpb_profile_items
for each row execute function public.set_updated_at();

-- 8. KONSTRUKSI ITEMS MASTER TABLE (BJLS, CAT, dll)
create table if not exists public.rpb_konstruksi_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null default 'pc',
  sort_order integer not null default 0,
  formula_expr text not null default '0',
  unit_price_idr numeric(18, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rpb_konstruksi_items_updated_at on public.rpb_konstruksi_items;
create trigger trg_rpb_konstruksi_items_updated_at
before update on public.rpb_konstruksi_items
for each row execute function public.set_updated_at();

-- 9. OTHER ITEMS MASTER TABLE (Blower, Motor, Rotor)
create table if not exists public.rpb_other_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (length(btrim(category)) > 0),
  model text not null default '-',
  unit text not null default 'pc',
  price_idr numeric(18, 2) not null default 0,
  is_active boolean not null default true,
  unique (name, category, model, unit),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rpb_other_items_updated_at on public.rpb_other_items;
create trigger trg_rpb_other_items_updated_at
before update on public.rpb_other_items
for each row execute function public.set_updated_at();

-- 10. FORMULA VARIABLES TABLE (width, length, height per section)
create table if not exists public.rpb_formula_variables (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('profile', 'konstruksi')),
  key text not null,
  label text not null,
  default_value numeric(18, 4) not null default 0,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section, key)
);

drop trigger if exists trg_rpb_formula_variables_updated_at on public.rpb_formula_variables;
create trigger trg_rpb_formula_variables_updated_at
before update on public.rpb_formula_variables
for each row execute function public.set_updated_at();

-- 11. SAVED SUMMARIES TABLE (Quotation history)
create table if not exists public.rpb_saved_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  customer_name text not null default '',
  project_name text not null default '',
  snapshot_json jsonb not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rpb_saved_summaries
add column if not exists is_deleted boolean not null default false;

drop trigger if exists trg_rpb_saved_summaries_updated_at on public.rpb_saved_summaries;
create trigger trg_rpb_saved_summaries_updated_at
before update on public.rpb_saved_summaries
for each row execute function public.set_updated_at();

-- ============================================
-- INDEXES
-- ============================================
create index if not exists idx_rpb_other_items_category_name
on public.rpb_other_items (category, name);

create index if not exists idx_rpb_saved_summaries_user_updated_at
on public.rpb_saved_summaries (user_id, updated_at desc);

create index if not exists idx_rpb_saved_summaries_updated_at
on public.rpb_saved_summaries (updated_at desc);

create index if not exists idx_rpb_saved_summaries_user_deleted_updated_at
on public.rpb_saved_summaries (user_id, is_deleted, updated_at desc);

create index if not exists idx_rpb_formula_variables_section_sort
on public.rpb_formula_variables (section, sort_order);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
alter table public.user_profiles enable row level security;
alter table public.rpb_settings enable row level security;
alter table public.rpb_profile_items enable row level security;
alter table public.rpb_konstruksi_items enable row level security;
alter table public.rpb_other_items enable row level security;
alter table public.rpb_saved_summaries enable row level security;
alter table public.rpb_formula_variables enable row level security;

-- USER PROFILES POLICIES
drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select"
on public.user_profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

-- RPB SETTINGS POLICIES
drop policy if exists "rpb_settings_select" on public.rpb_settings;
create policy "rpb_settings_select"
on public.rpb_settings for select
to authenticated
using (true);

drop policy if exists "rpb_settings_admin_write" on public.rpb_settings;
create policy "rpb_settings_admin_write"
on public.rpb_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- PROFILE ITEMS POLICIES
drop policy if exists "rpb_profile_items_select" on public.rpb_profile_items;
create policy "rpb_profile_items_select"
on public.rpb_profile_items for select
to authenticated
using (true);

drop policy if exists "rpb_profile_items_admin_write" on public.rpb_profile_items;
create policy "rpb_profile_items_admin_write"
on public.rpb_profile_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- KONSTRUKSI ITEMS POLICIES
drop policy if exists "rpb_konstruksi_items_select" on public.rpb_konstruksi_items;
create policy "rpb_konstruksi_items_select"
on public.rpb_konstruksi_items for select
to authenticated
using (true);

drop policy if exists "rpb_konstruksi_items_admin_write" on public.rpb_konstruksi_items;
create policy "rpb_konstruksi_items_admin_write"
on public.rpb_konstruksi_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- OTHER ITEMS POLICIES
drop policy if exists "rpb_other_items_select" on public.rpb_other_items;
create policy "rpb_other_items_select"
on public.rpb_other_items for select
to authenticated
using (true);

drop policy if exists "rpb_other_items_admin_write" on public.rpb_other_items;
create policy "rpb_other_items_admin_write"
on public.rpb_other_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- SAVED SUMMARIES POLICIES
drop policy if exists "rpb_saved_summaries_select_own" on public.rpb_saved_summaries;
create policy "rpb_saved_summaries_select_own"
on public.rpb_saved_summaries for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "rpb_saved_summaries_insert_own" on public.rpb_saved_summaries;
create policy "rpb_saved_summaries_insert_own"
on public.rpb_saved_summaries for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "rpb_saved_summaries_update_own" on public.rpb_saved_summaries;
create policy "rpb_saved_summaries_update_own"
on public.rpb_saved_summaries for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "rpb_saved_summaries_delete_own" on public.rpb_saved_summaries;
create policy "rpb_saved_summaries_delete_own"
on public.rpb_saved_summaries for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

-- FORMULA VARIABLES POLICIES
drop policy if exists "rpb_formula_variables_select" on public.rpb_formula_variables;
create policy "rpb_formula_variables_select"
on public.rpb_formula_variables for select
to authenticated
using (true);

drop policy if exists "rpb_formula_variables_admin_write" on public.rpb_formula_variables;
create policy "rpb_formula_variables_admin_write"
on public.rpb_formula_variables for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ============================================
-- SEED DATA
-- ============================================

-- RPB Settings
insert into public.rpb_settings (id, usd_to_idr)
values (1, 16900)
on conflict (id) do update set usd_to_idr = excluded.usd_to_idr;

-- Profile Items (16 items)
insert into public.rpb_profile_items
  (code, name, unit, sort_order, formula_expr, price_idr_30, price_idr_45, is_active)
values
  ('panel', 'Panel', 'lot', 1, '(((width * length + width * height + length * height) / 3600000) * 2) * 1.4', 1554800, 1859000, true),
  ('corner_profil', 'Corner Profil', 'pc', 2, '(((width + width + length + height) * 4) / 5600) * 2', 663632, 777400, true),
  ('omega_profil', 'Omega Profil', 'pc', 3, '((length / 1200) * ((2 * width + 2 * height) / 5600) * 1.3) * 3', 568823, 895700, true),
  ('corner', 'Corner', 'pc', 4, '24', 37349, 50700, true),
  ('pinchplate', 'Pinchplate', 'pc', 5, '(corner_profil + omega_profil) * 2', 83144, 106470, true),
  ('round_rubber', 'Round Rubber', 'm', 6, 'pinchplate * 5.6', 0, 0, true),
  ('flat_rubber', 'Flat Rubber', 'm', 7, 'pinchplate * 5.6', 0, 0, true),
  ('angle_block', 'Angle Block', 'pc', 8, 'corner * 3', 0, 0, true),
  ('omega_join', 'Omega Join', 'pc', 9, '(length / 1200) * 8 * 1.2', 9971, 13854, true),
  ('handle', 'Handle', 'pc', 10, '0', 84500, 84500, true),
  ('door', 'Door', 'pc', 11, '5', 1273751, 1273751, true),
  ('hinge', 'Hinge', 'pc', 12, '0', 118300, 118300, true),
  ('damper', 'Damper', 'pc', 13, '5', 760500, 760500, true),
  ('screw_house', 'Screw House', 'pc', 14, 'panel * 28', 0, 1183, true),
  ('pvc45p', 'PVC45P', 'pc', 15, 'omega_profil * 6', 0, 14868, true),
  ('pa6045t', 'PA6045T', 'pc', 16, 'omega_profil * 6', 0, 17914, true)
on conflict (code) do nothing;

-- Konstruksi Items (11 items)
insert into public.rpb_konstruksi_items
  (code, name, unit, sort_order, formula_expr, unit_price_idr, is_active)
values
  ('bjls', 'BJLS', 'unit', 1, '5', 2535000, true),
  ('cat', 'CAT', 'unit', 2, '10', 118300, true),
  ('unp', 'UNP', 'unit', 3, '3', 507000, true),
  ('siku', 'SIKU', 'unit', 4, '3', 422500, true),
  ('majun', 'MAJUN', 'unit', 5, '3', 16900, true),
  ('argon', 'Argon', 'unit', 6, '1', 422500, true),
  ('kawat_las', 'Kawat Las', 'unit', 7, '5', 33800, true),
  ('thinner', 'Thinner', 'unit', 8, '20', 50700, true),
  ('girinda', 'Girinda', 'unit', 9, '20', 67600, true),
  ('amplas', 'Amplas', 'unit', 10, '40', 16900, true),
  ('dll', 'Dll', 'unit', 11, '1', 838240, true)
on conflict (code) do nothing;

-- Other Items (29 items - Blower, Motor, Rotor)
insert into public.rpb_other_items
  (name, category, model, unit, price_idr, is_active)
values
  ('SYQ 315', 'Blower', 'ER90C-4DN.N7.1R', 'pc', 5809375, true),
  ('SYQ 355', 'Blower', 'ER10C-6DN.R7.1R', 'pc', 7203625, true),
  ('SYQ 400', 'Blower', 'ER45C-ZID.GG.1R', 'pc', 8458450, true),
  ('SYQ 450', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 10076625, true),
  ('SYQ 500', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 12176450, true),
  ('SYQ 560', 'Blower', 'ER63C-4DN.I7.1R', 'pc', 16173300, true),
  ('SYQ 630', 'Blower', 'ER90C-6DN.N7.1R', 'pc', 19528795, true),
  ('SYQ 710', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 25245220, true),
  ('ZA 1000 m3-EC', 'Blower', 'ER56C-ZID.GQ.CR', 'pc', 16562000, true),
  ('ZA 1500 m3-EC', 'Blower', 'ER56C-ZID.GQ.CR', 'pc', 16562000, true),
  ('ZA 2000 m3-EC', 'Blower', 'ER71C-4DN.I7.1R', 'pc', 18590000, true),
  ('ZA 2500 m3-EC', 'Blower', 'ER71C-4DN.K7.1R', 'pc', 20280000, true),
  ('ZA-3000 m3-EC', 'Blower', 'ER56C-4DN.H7.1R', 'pc', 21970000, true),
  ('ZA-5000 m3-EC', 'Blower', '-', 'pc', 22493900, true),
  ('ZA-9000 m3-EC', 'Blower', '-', 'pc', 31265000, true),
  ('ZA-10000-m3-EC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 31265000, true),
  ('ZA-13000-m3-AC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 20280000, true),
  ('ZA-18000-m3-AC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 35490000, true),
  ('ZA-22000-m3-AC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 35490000, true),
  ('SIEMENS 4 KW', 'Motor', 'ER40C-ZID.GG.1R', 'pc', 4140500, true),
  ('SIEMENS 5.5 KW', 'Motor', 'ER56C-ZID.GQ.1R', 'pc', 6506500, true),
  ('SIEMENS 7.5 KW', 'Motor', 'ER56C-ZID.GQ.CR', 'pc', 8872500, true),
  ('SIEMENS 11 KW', 'Motor', 'ER71C-4DN.K7.1R', 'pc', 14196000, true),
  ('SIEMENS 15 KW', 'Motor', '-', 'pc', 18928000, true),
  ('SIEMENS 22 KW', 'Motor', '-', 'pc', 30758000, true),
  ('SIEMENS 30 KW', 'Motor', '-', 'pc', 40220000, true),
  ('RO 075', 'Rotor', '450X200', 'pc', 31138250, true),
  ('RO 100', 'Rotor', '550X200', 'pc', 33005700, true),
  ('RO 125', 'Rotor', '650X200', 'pc', 40340300, true),
  ('RO 150', 'Rotor', '770 x200', 'pc', 47117800, true)
on conflict (name, category, model, unit) do nothing;

-- Formula Variables
insert into public.rpb_formula_variables
  (section, key, label, default_value, is_default, sort_order)
values
  ('profile', 'width', 'Width', 0, true, 1),
  ('profile', 'length', 'Length', 0, true, 2),
  ('profile', 'height', 'Height', 0, true, 3),
  ('konstruksi', 'width', 'Width', 0, true, 1),
  ('konstruksi', 'length', 'Length', 0, true, 2),
  ('konstruksi', 'height', 'Height', 0, true, 3)
on conflict (section, key) do nothing;
