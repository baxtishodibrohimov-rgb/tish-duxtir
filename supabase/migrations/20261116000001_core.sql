-- =====================================================================
-- Tish Duxtir — asosiy sxema
-- Pul summalari butun son (so'm) sifatida saqlanadi: bigint.
-- Har bir jadval klinikaga bog'langan; ruxsatlar RLS orqali bazada tekshiriladi.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Profillar ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  email       text,
  avatar_url  text,
  telegram_id bigint unique,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Klinikalar ----------
create table public.clinics (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id),
  name             text not null,
  logo_url         text,
  phone            text,
  address          text,
  currency         text not null default 'UZS',
  timezone         text not null default 'Asia/Tashkent',
  slot_minutes     int  not null default 30 check (slot_minutes in (10, 15, 20, 30, 60)),
  work_start       time not null default '09:00',
  work_end         time not null default '18:00',
  days_visible     int  not null default 3 check (days_visible between 1 and 7),
  telegram_chat_id text,
  -- ombor sozlamalari (texnik tavsif: "Uch ishlash usuli")
  stock_mode       text not null default 'exact' check (stock_mode in ('simple', 'mid', 'exact')),
  allow_negative_stock boolean not null default true,
  access_until     timestamptz not null default (now() + interval '14 days'),
  created_at       timestamptz not null default now()
);

-- ---------- Xodimlar va rollar ----------
create table public.clinic_members (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner', 'doctor', 'assistant', 'admin', 'curator', 'storekeeper')),
  full_name       text not null default '',
  color           text not null default '#0ea5e9',
  default_room_id uuid,
  -- rol bo'yicha standart ruxsatlarni ustidan yozish: {"cashbox.view": true, ...}
  permissions     jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index on public.clinic_members (user_id);

-- Rol bo'yicha standart ruxsatlar.
create or replace function public.role_default_perm(_role text, _perm text)
returns boolean language sql immutable as $$
  select case _role
    when 'owner'       then true
    when 'admin'       then _perm in ('schedule.view','schedule.edit','patients.view','patients.edit','cashbox.view','cashbox.edit','warehouse.view','reports.view')
    when 'curator'     then _perm in ('schedule.view','patients.view','patients.edit','cashbox.view','cashbox.edit')
    when 'doctor'      then _perm in ('schedule.view','schedule.edit','patients.view','patients.edit','warehouse.view')
    when 'assistant'   then _perm in ('schedule.view','patients.view','warehouse.view')
    when 'storekeeper' then _perm in ('warehouse.view','warehouse.edit','warehouse.admin')
    else false
  end
$$;

create or replace function public.is_member(_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinic_members m
     join public.clinics c on c.id = m.clinic_id
    where m.clinic_id = _clinic and m.user_id = auth.uid() and m.is_active
      and c.access_until > now()
  )
$$;

create or replace function public.has_perm(_clinic uuid, _perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when m.role = 'owner' then true
             when m.permissions ? _perm then (m.permissions->>_perm)::boolean
             else public.role_default_perm(m.role, _perm)
           end
      from public.clinic_members m
      join public.clinics c on c.id = m.clinic_id
     where m.clinic_id = _clinic and m.user_id = auth.uid() and m.is_active
       and c.access_until > now()
  ), false)
$$;

create or replace function public.is_owner(_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinics where id = _clinic and owner_id = auth.uid())
$$;

-- Klinika yaratilganda egasi avtomatik a'zo bo'ladi va standart ma'lumotlar qo'shiladi.
create or replace function public.on_clinic_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.clinic_members (clinic_id, user_id, role, full_name)
  select new.id, new.owner_id, 'owner', coalesce(p.full_name, '')
    from public.profiles p where p.id = new.owner_id
  on conflict do nothing;

  insert into public.patient_statuses (clinic_id, name, color, kind, reminder_months, position) values
    (new.id, '1 oydan keyin eslatish',  '#f59e0b', 'reminder', 1,  100),
    (new.id, '3 oydan keyin eslatish',  '#ef4444', 'reminder', 3,  101),
    (new.id, '6 oydan keyin eslatish',  '#8b5cf6', 'reminder', 6,  102),
    (new.id, '1 yildan keyin eslatish', '#6366f1', 'reminder', 12, 103);

  insert into public.cashboxes (clinic_id, name, method, position) values
    (new.id, 'Naqd pul', 'cash', 0), (new.id, 'Terminal', 'terminal', 1), (new.id, 'Click (online)', 'click', 2);

  insert into public.warehouses (clinic_id, name, is_main, responsible_id) values (new.id, 'Asosiy ombor', true, new.owner_id);
  return new;
end $$;

-- ---------- Kabinetlar, statuslar ----------
create table public.rooms (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name      text not null,
  color     text not null default '#0ea5e9',
  position  int  not null default 0,
  is_active boolean not null default true
);
alter table public.clinic_members
  add constraint clinic_members_room_fk foreign key (default_room_id) references public.rooms(id) on delete set null;

create table public.patient_statuses (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  name            text not null,
  color           text not null default '#0ea5e9',
  kind            text not null default 'manual' check (kind in ('manual', 'reminder')),
  reminder_months int check (reminder_months is null or reminder_months > 0),
  position        int not null default 0
);

-- ---------- Bemorlar ----------
create table public.patients (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  card_number        text not null,
  last_name          text not null default '',
  first_name         text not null default '',
  middle_name        text not null default '',
  full_name          text generated always as (btrim(regexp_replace(last_name || ' ' || first_name || ' ' || middle_name, '\s+', ' ', 'g'))) stored,
  phone              text,
  phone2             text,
  birth_date         date,
  gender             text check (gender in ('male', 'female')),
  address            text,
  source             text,
  referrer           text,
  important_info     text,
  notes              text,
  status_ids         uuid[] not null default '{}',
  reminder_status_id uuid references public.patient_statuses(id) on delete set null,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (clinic_id, card_number)
);
create index on public.patients (clinic_id, full_name);
create index on public.patients (clinic_id, phone);

-- Karta raqami klinika ichida ketma-ket; parallel yozuvlarda takrorlanmasligi uchun qulf olinadi.
create or replace function public.assign_card_number()
returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  if new.card_number is not null and new.card_number <> '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('card:' || new.clinic_id::text));
  select coalesce(max(card_number::int), 0) + 1 into n
    from public.patients where clinic_id = new.clinic_id and card_number ~ '^\d+$';
  new.card_number := lpad(n::text, 4, '0');
  return new;
end $$;
create trigger patients_card_number before insert on public.patients
  for each row execute function public.assign_card_number();

-- ---------- Jadval ----------
create table public.visits (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  doctor_id      uuid references auth.users(id),
  assistant_id   uuid references auth.users(id),
  room_id        uuid references public.rooms(id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'planned' check (status in ('planned', 'confirmed', 'arrived', 'completed', 'no_show', 'cancelled')),
  is_first_visit boolean not null default false,
  comment        text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.visits (clinic_id, starts_at);
create index on public.visits (patient_id);

create table public.time_reservations (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  room_id    uuid references public.rooms(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text not null,
  color      text not null default '#94a3b8',
  created_by uuid references auth.users(id)
);

create table public.staff_shifts (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  member_id  uuid not null references public.clinic_members(id) on delete cascade,
  room_id    uuid references public.rooms(id) on delete set null,
  shift_date date not null,
  starts_at  time not null,
  ends_at    time not null
);

-- ---------- Prays ----------
create table public.price_categories (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name      text not null,
  color_idx int  not null default 0,
  position  int  not null default 0
);
create table public.price_items (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  category_id uuid not null references public.price_categories(id) on delete cascade,
  name        text not null default '',
  code        text,
  price       bigint not null default 0 check (price >= 0),
  position    int not null default 0,
  archived    boolean not null default false
);

-- ---------- Davolash ----------
create table public.treatment_plans (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  doctor_id   uuid references auth.users(id),
  title       text not null,
  status      text not null default 'draft' check (status in ('draft', 'proposed', 'accepted', 'rejected')),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  created_at  timestamptz not null default now()
);
create table public.treatment_plan_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.treatment_plans(id) on delete cascade,
  price_item_id uuid references public.price_items(id) on delete set null,
  name          text not null,
  tooth         text,
  qty           int not null default 1 check (qty > 0),
  price         bigint not null default 0
);

create table public.treatment_records (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  visit_id    uuid references public.visits(id) on delete set null,
  doctor_id   uuid references auth.users(id),
  tooth       text,
  diagnosis   text,
  description text,
  created_at  timestamptz not null default now()
);
create table public.record_files (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  record_id    uuid references public.treatment_records(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  kind         text not null default 'file' check (kind in ('image', 'audio', 'xray', 'file')),
  storage_path text not null,       -- Supabase Storage: treatment-files/<clinic_id>/...
  name         text,
  created_at   timestamptz not null default now()
);

-- ---------- Bajarilgan ishlar (akt) ----------
-- "Qilingan ish" — shifokor bajargan xizmatlar summasi. To'lov alohida (money_moves).
create table public.acts (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id   uuid references public.visits(id) on delete set null,
  doctor_id  uuid references auth.users(id),
  warehouse_id uuid,               -- avtomatik material chiqimi qaysi ombordan (FK 003 migratsiyada)
  act_date   date not null default current_date,
  status     text not null default 'draft' check (status in ('draft', 'closed', 'cancelled')),
  discount   bigint not null default 0 check (discount >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.act_items (
  id            uuid primary key default gen_random_uuid(),
  act_id        uuid not null references public.acts(id) on delete cascade,
  price_item_id uuid references public.price_items(id) on delete set null,
  name          text not null,
  tooth         text,
  qty           int not null default 1 check (qty > 0),
  price         bigint not null default 0 check (price >= 0)
);

-- ---------- Eslatmalar va jurnal ----------
create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid references public.patients(id) on delete cascade,
  assigned_to uuid references auth.users(id),
  remind_at   timestamptz not null,
  comment     text,
  status      text not null default 'planned' check (status in ('planned', 'sent', 'cancelled')),
  auto        boolean not null default false
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  user_id    uuid default auth.uid(),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
