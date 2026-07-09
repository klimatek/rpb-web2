-- Run this in Supabase SQL Editor (project: qbhmmjhbbbvzkertxqcf)
-- Then create bootstrap admin using the script in scripts/bootstrap-admin.mjs

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create index if not exists idx_rpb_other_items_category_name
on public.rpb_other_items (category, name);

drop trigger if exists trg_rpb_other_items_updated_at on public.rpb_other_items;
create trigger trg_rpb_other_items_updated_at
before update on public.rpb_other_items
for each row execute function public.set_updated_at();

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

create index if not exists idx_rpb_saved_summaries_user_updated_at
on public.rpb_saved_summaries (user_id, updated_at desc);

create index if not exists idx_rpb_saved_summaries_updated_at
on public.rpb_saved_summaries (updated_at desc);

create index if not exists idx_rpb_saved_summaries_user_deleted_updated_at
on public.rpb_saved_summaries (user_id, is_deleted, updated_at desc);

drop trigger if exists trg_rpb_saved_summaries_updated_at on public.rpb_saved_summaries;
create trigger trg_rpb_saved_summaries_updated_at
before update on public.rpb_saved_summaries
for each row execute function public.set_updated_at();

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

create index if not exists idx_rpb_formula_variables_section_sort
on public.rpb_formula_variables (section, sort_order);

drop trigger if exists trg_rpb_formula_variables_updated_at on public.rpb_formula_variables;
create trigger trg_rpb_formula_variables_updated_at
before update on public.rpb_formula_variables
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.rpb_settings enable row level security;
alter table public.rpb_profile_items enable row level security;
alter table public.rpb_konstruksi_items enable row level security;
alter table public.rpb_other_items enable row level security;
alter table public.rpb_saved_summaries enable row level security;
alter table public.rpb_formula_variables enable row level security;

drop policy if exists "user_profiles_select" on public.user_profiles;
create policy "user_profiles_select"
on public.user_profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

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

insert into public.rpb_settings (id, usd_to_idr)
values (1, 16900)
on conflict (id) do update set usd_to_idr = excluded.usd_to_idr;

insert into public.rpb_profile_items
  (code, name, unit, sort_order, formula_expr, price_idr_30, price_idr_45, is_active)
values
  ('panel', 'Panel', 'lot', 1, '(((width * length + width * height + length * height) / 3600000) * 2) * 1.4', 92 * 16900, 110 * 16900, true),
  ('corner_profil', 'Corner Profil', 'pc', 2, '(((width + width + length + height) * 4) / 5600) * 2', 39.28 * 16900, 46 * 16900, true),
  ('omega_profil', 'Omega Profil', 'pc', 3, '((length / 1200) * ((2 * width + 2 * height) / 5600) * 1.3) * 3', 33.67 * 16900, 53 * 16900, true),
  ('corner', 'Corner', 'pc', 4, '24', 2.21 * 16900, 3 * 16900, true),
  ('pinchplate', 'Pinchplate', 'pc', 5, '(corner_profil + omega_profil) * 2', 4.92 * 16900, 6.3 * 16900, true),
  ('round_rubber', 'Round Rubber', 'm', 6, 'pinchplate * 5.6', 0.18 * 16900, 0, true),
  ('flat_rubber', 'Flat Rubber', 'm', 7, 'pinchplate * 5.6', 0.18 * 16900, 0, true),
  ('angle_block', 'Angle Block', 'pc', 8, 'corner * 3', 0.07 * 16900, 0, true),
  ('omega_join', 'Omega Join', 'pc', 9, '(length / 1200) * 8 * 1.2', 0.59 * 16900, 0.82 * 16900, true),
  ('handle', 'Handle', 'pc', 10, '0', 5 * 16900, 5 * 16900, true),
  ('door', 'Door', 'pc', 11, '5', 75.37 * 16900, 75.37 * 16900, true),
  ('hinge', 'Hinge', 'pc', 12, '0', 7 * 16900, 7 * 16900, true),
  ('damper', 'Damper', 'pc', 13, '5', 45 * 16900, 45 * 16900, true),
  ('screw_house', 'Screw House', 'pc', 14, 'panel * 28', 0, 0.07 * 16900, true),
  ('pvc45p', 'PVC45P', 'pc', 15, 'omega_profil * 6', 0, 0.88 * 16900, true),
  ('pa6045t', 'PA6045T', 'pc', 16, 'omega_profil * 6', 0, 1.06 * 16900, true)
on conflict (code) do nothing;

insert into public.rpb_konstruksi_items
  (code, name, unit, sort_order, formula_expr, unit_price_idr, is_active)
values
  ('bjls', 'BJLS', 'unit', 1, '5', 150 * 16900, true),
  ('cat', 'CAT', 'unit', 2, '10', 7 * 16900, true),
  ('unp', 'UNP', 'unit', 3, '3', 30 * 16900, true),
  ('siku', 'SIKU', 'unit', 4, '3', 25 * 16900, true),
  ('majun', 'MAJUN', 'unit', 5, '3', 1 * 16900, true),
  ('argon', 'Argon', 'unit', 6, '1', 25 * 16900, true),
  ('kawat_las', 'Kawat Las', 'unit', 7, '5', 2 * 16900, true),
  ('thinner', 'Thinner', 'unit', 8, '20', 3 * 16900, true),
  ('girinda', 'Girinda', 'unit', 9, '20', 4 * 16900, true),
  ('amplas', 'Amplas', 'unit', 10, '40', 1 * 16900, true),
  ('dll', 'Dll', 'unit', 11, '1', 49.6 * 16900, true)
on conflict (code) do nothing;

insert into public.rpb_other_items
  (name, category, model, unit, price_idr, is_active)
values
  ('SYQ 315', 'Blower', 'ER90C-4DN.N7.1R', 'pc', 343.75 * 16900, true),
  ('SYQ 355', 'Blower', 'ER10C-6DN.R7.1R', 'pc', 426.25 * 16900, true),
  ('SYQ 400', 'Blower', 'ER45C-ZID.GG.1R', 'pc', 500.5 * 16900, true),
  ('SYQ 450', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 596.25 * 16900, true),
  ('SYQ 500', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 720.5 * 16900, true),
  ('SYQ 560', 'Blower', 'ER63C-4DN.I7.1R', 'pc', 957 * 16900, true),
  ('SYQ 630', 'Blower', 'ER90C-6DN.N7.1R', 'pc', 1155.55 * 16900, true),
  ('SYQ 710', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 1493.8 * 16900, true),
  ('ZA 1000 m3-EC', 'Blower', 'ER56C-ZID.GQ.CR', 'pc', 980 * 16900, true),
  ('ZA 1500 m3-EC', 'Blower', 'ER56C-ZID.GQ.CR', 'pc', 980 * 16900, true),
  ('ZA 2000 m3-EC', 'Blower', 'ER71C-4DN.I7.1R', 'pc', 1100 * 16900, true),
  ('ZA 2500 m3-EC', 'Blower', 'ER71C-4DN.K7.1R', 'pc', 1200 * 16900, true),
  ('ZA-3000 m3-EC', 'Blower', 'ER56C-4DN.H7.1R', 'pc', 1300 * 16900, true),
  ('ZA-5000 m3-EC', 'Blower', '-', 'pc', 1331 * 16900, true),
  ('ZA-9000 m3-EC', 'Blower', '-', 'pc', 1850 * 16900, true),
  ('ZA-10000-m3-EC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 1850 * 16900, true),
  ('ZA-13000-m3-AC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 1200 * 16900, true),
  ('ZA-18000-m3-AC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 2100 * 16900, true),
  ('ZA-22000-m3-AC', 'Blower', 'ER31C-ZID.DC.1R', 'pc', 2100 * 16900, true),
  ('SIEMENS 4 KW', 'Motor', 'ER40C-ZID.GG.1R', 'pc', 245 * 16900, true),
  ('SIEMENS 5.5 KW', 'Motor', 'ER56C-ZID.GQ.1R', 'pc', 385 * 16900, true),
  ('SIEMENS 7.5 KW', 'Motor', 'ER56C-ZID.GQ.CR', 'pc', 525 * 16900, true),
  ('SIEMENS 11 KW', 'Motor', 'ER71C-4DN.K7.1R', 'pc', 840 * 16900, true),
  ('SIEMENS 15 KW', 'Motor', '-', 'pc', 1120 * 16900, true),
  ('SIEMENS 22 KW', 'Motor', '-', 'pc', 1820 * 16900, true),
  ('SIEMENS 30 KW', 'Motor', '-', 'pc', 2380 * 16900, true),
  ('RO 075', 'Rotor', '450X200', 'pc', 1842.5 * 16900, true),
  ('RO 100', 'Rotor', '550X200', 'pc', 1953 * 16900, true),
  ('RO 125', 'Rotor', '650X200', 'pc', 2387 * 16900, true),
  ('RO 150', 'Rotor', '770 x200', 'pc', 2788 * 16900, true)
on conflict do nothing;

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

-- Optional: disable self-signup in Supabase Dashboard > Authentication > Providers > Email
-- Set "Enable email signups" = OFF to enforce admin-only user creation.
