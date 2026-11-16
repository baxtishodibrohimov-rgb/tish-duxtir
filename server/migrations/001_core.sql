-- =====================================================================
-- Tish Duxtir — asosiy sxema (o'z serverimizdagi PostgreSQL uchun)
--
--  Tashkilot (orgs) -> filiallar (branches).
--  Umumiy (tashkilot darajasida): bemorlar, statuslar, prays, tovarlar,
--    kontragentlar, kalkulyatsiya kartalari.
--  Filial darajasida: kabinetlar, jadval, kassalar, omborlar, aktlar.
--
--  Pul summalari — bigint (so'm). Joriy foydalanuvchi API tomonidan
--  har bir tranzaksiyada `app.user_id` sozlamasi orqali beriladi.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Foydalanuvchilar ----------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  phone         text unique,
  password_hash text not null,
  full_name     text not null default '',
  avatar_url    text,
  telegram_id   bigint unique,
  token_version int  not null default 0,     -- oshirilsa barcha sessiyalar bekor bo'ladi
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create or replace function app_uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------- Tashkilot va filiallar ----------
create table orgs (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  logo_url             text,
  currency             text not null default 'UZS',
  timezone             text not null default 'Asia/Tashkent',
  stock_mode           text not null default 'exact' check (stock_mode in ('simple', 'mid', 'exact')),
  allow_negative_stock boolean not null default true,
  telegram_chat_id     text,
  created_at           timestamptz not null default now()
);

create table branches (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  name         text not null,
  address      text,
  phone        text,
  slot_minutes int  not null default 30 check (slot_minutes in (10, 15, 20, 30, 60)),
  work_start   time not null default '09:00',
  work_end     time not null default '18:00',
  days_visible int  not null default 3 check (days_visible between 1 and 7),
  position     int  not null default 0,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- Xodimlar ----------
create table members (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         text not null check (role in ('owner', 'doctor', 'assistant', 'admin', 'curator', 'storekeeper')),
  full_name    text not null default '',
  color        text not null default '#0ea5e9',
  permissions  jsonb not null default '{}'::jsonb,   -- rol standartini ustidan yozish: {"cashbox.view": true}
  all_branches boolean not null default false,        -- barcha filiallarga kirish
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on members (user_id);

create table rooms (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  name      text not null,
  color     text not null default '#0ea5e9',
  position  int  not null default 0,
  is_active boolean not null default true
);

-- Xodim qaysi filiallarda ishlaydi.
create table member_branches (
  member_id       uuid not null references members(id) on delete cascade,
  branch_id       uuid not null references branches(id) on delete cascade,
  default_room_id uuid references rooms(id) on delete set null,
  primary key (member_id, branch_id)
);

-- Rol bo'yicha standart ruxsatlar (web/src/lib/perms.ts bilan bir xil).
create or replace function role_default_perm(_role text, _perm text)
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

-- Ruxsat tekshiruvi. _branch berilsa, xodim o'sha filialga kirish huquqiga ham ega bo'lishi kerak.
create or replace function has_perm(_org uuid, _perm text, _branch uuid default null)
returns boolean language sql stable as $$
  select coalesce((
    select (case
              when m.role = 'owner' then true
              when m.permissions ? _perm then (m.permissions->>_perm)::boolean
              else role_default_perm(m.role, _perm)
            end)
       and (_branch is null or m.role = 'owner' or m.all_branches
            or exists (select 1 from member_branches mb where mb.member_id = m.id and mb.branch_id = _branch))
      from members m
     where m.org_id = _org and m.user_id = app_uid() and m.is_active
  ), false)
$$;

-- ---------- Statuslar ----------
create table patient_statuses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  name            text not null,
  color           text not null default '#0ea5e9',
  kind            text not null default 'manual' check (kind in ('manual', 'reminder')),
  reminder_months int check (reminder_months is null or reminder_months > 0),
  position        int not null default 0
);

-- ---------- Bemorlar (barcha filiallar uchun umumiy) ----------
create table patients (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  home_branch_id     uuid references branches(id) on delete set null,  -- birinchi kelgan filial
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
  telegram_chat_id   bigint,
  legacy_id          text,            -- eski (Lovable) bazadagi id, import uchun
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (org_id, card_number)
);
create index on patients (org_id, full_name);
create index on patients (org_id, phone);

create or replace function assign_card_number()
returns trigger language plpgsql as $$
declare n int;
begin
  if new.card_number is not null and new.card_number <> '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('card:' || new.org_id::text));
  select coalesce(max(card_number::int), 0) + 1 into n
    from patients where org_id = new.org_id and card_number ~ '^\d+$';
  new.card_number := lpad(n::text, 4, '0');
  return new;
end $$;
create trigger patients_card_number before insert on patients
  for each row execute function assign_card_number();

-- ---------- Jadval (filial darajasida) ----------
create table visits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  branch_id      uuid not null references branches(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  doctor_id      uuid references users(id),
  assistant_id   uuid references users(id),
  room_id        uuid references rooms(id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'planned' check (status in ('planned', 'confirmed', 'arrived', 'completed', 'no_show', 'cancelled')),
  is_first_visit boolean not null default false,
  comment        text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on visits (branch_id, starts_at);
create index on visits (patient_id);

create table time_reservations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  branch_id  uuid not null references branches(id) on delete cascade,
  room_id    uuid references rooms(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text not null,
  color      text not null default '#94a3b8',
  created_by uuid references users(id)
);
create index on time_reservations (branch_id, starts_at);

create table staff_shifts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  branch_id  uuid not null references branches(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  room_id    uuid references rooms(id) on delete set null,
  shift_date date not null,
  starts_at  time not null,
  ends_at    time not null
);

-- ---------- Prays (umumiy; filial bo'yicha boshqa narx qo'yish mumkin) ----------
create table price_categories (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  name      text not null,
  color_idx int  not null default 0,
  position  int  not null default 0
);
create table price_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  category_id uuid not null references price_categories(id) on delete cascade,
  name        text not null default '',
  code        text,
  price       bigint not null default 0 check (price >= 0),
  position    int not null default 0,
  archived    boolean not null default false
);
create table price_overrides (
  price_item_id uuid not null references price_items(id) on delete cascade,
  branch_id     uuid not null references branches(id) on delete cascade,
  price         bigint not null check (price >= 0),
  primary key (price_item_id, branch_id)
);

-- ---------- Davolash ----------
create table treatment_plans (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  patient_id       uuid not null references patients(id) on delete cascade,
  doctor_id        uuid references users(id),
  title            text not null,
  status           text not null default 'draft' check (status in ('draft', 'proposed', 'accepted', 'rejected')),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  created_at       timestamptz not null default now()
);
create table treatment_plan_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references treatment_plans(id) on delete cascade,
  price_item_id uuid references price_items(id) on delete set null,
  name          text not null,
  tooth         text,
  qty           int not null default 1 check (qty > 0),
  price         bigint not null default 0
);

create table treatment_records (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null,
  patient_id  uuid not null references patients(id) on delete cascade,
  visit_id    uuid references visits(id) on delete set null,
  doctor_id   uuid references users(id),
  tooth       text,
  diagnosis   text,
  description text,
  created_at  timestamptz not null default now()
);
create table record_files (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  record_id    uuid references treatment_records(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  kind         text not null default 'file' check (kind in ('image', 'audio', 'xray', 'file')),
  storage_path text not null,       -- serverdagi fayl: <FILES_DIR>/<org_id>/<uuid>.<ext>
  name         text,
  mime         text,
  size_bytes   bigint,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now()
);

-- ---------- Bajarilgan ishlar (akt) ----------
create table acts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  branch_id    uuid not null references branches(id),
  patient_id   uuid not null references patients(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  doctor_id    uuid references users(id),
  warehouse_id uuid,               -- FK 003 da
  act_date     date not null default current_date,
  status       text not null default 'draft' check (status in ('draft', 'closed', 'cancelled')),
  discount     bigint not null default 0 check (discount >= 0),
  created_by   uuid references users(id),
  created_at   timestamptz not null default now()
);
create index on acts (patient_id);
create index on acts (branch_id, act_date);
create table act_items (
  id            uuid primary key default gen_random_uuid(),
  act_id        uuid not null references acts(id) on delete cascade,
  price_item_id uuid references price_items(id) on delete set null,
  name          text not null,
  tooth         text,
  qty           int not null default 1 check (qty > 0),
  price         bigint not null default 0 check (price >= 0)
);

-- ---------- Eslatmalar va jurnal ----------
create table reminders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  patient_id  uuid references patients(id) on delete cascade,
  assigned_to uuid references users(id),
  remind_at   timestamptz not null,
  comment     text,
  status      text not null default 'planned' check (status in ('planned', 'sent', 'cancelled')),
  auto        boolean not null default false
);

create table audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid default app_uid(),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (org_id, created_at desc);

-- Yangi tashkilot: standart statuslar.
create or replace function on_org_created()
returns trigger language plpgsql as $$
begin
  insert into patient_statuses (org_id, name, color, kind, reminder_months, position) values
    (new.id, '1 oydan keyin eslatish',  '#f59e0b', 'reminder', 1,  100),
    (new.id, '3 oydan keyin eslatish',  '#ef4444', 'reminder', 3,  101),
    (new.id, '6 oydan keyin eslatish',  '#8b5cf6', 'reminder', 6,  102),
    (new.id, '1 yildan keyin eslatish', '#6366f1', 'reminder', 12, 103);
  return new;
end $$;
create trigger on_org_created after insert on orgs
  for each row execute function on_org_created();
