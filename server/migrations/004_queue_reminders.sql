-- =====================================================================
-- Kutish navbati va eslatmalar (yuqori menyudagi ikki tugma uchun)
-- =====================================================================

-- Kutish navbati: bo'sh vaqt chiqsa, bemorni shu ro'yxatdan qabulga yoziladi.
create table waiting_list (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  branch_id   uuid not null references branches(id) on delete cascade,
  patient_id  uuid references patients(id) on delete cascade,
  patient_name text not null default '',         -- bemor hali kartaga kiritilmagan bo'lsa
  doctor_id   uuid references users(id),
  comment     text,
  created_by  uuid default app_uid() references users(id),
  created_at  timestamptz not null default now()
);
create index on waiting_list (branch_id, created_at);

-- Eslatmalar: bajarildi belgisi va kimga mo'ljallangani.
alter table reminders drop constraint if exists reminders_status_check;
alter table reminders add constraint reminders_status_check check (status in ('planned', 'sent', 'cancelled', 'done'));
alter table reminders add column if not exists audience text not null default 'me' check (audience in ('me', 'admins', 'owners'));
alter table reminders add column if not exists created_by uuid default app_uid() references users(id);
alter table reminders add column if not exists created_at timestamptz not null default now();
create index if not exists reminders_org_remind on reminders (org_id, remind_at);

-- ---------------------------------------------------------------------
-- Jadval: bemor belgisi, yangi holatlar, qabuldagi manipulyatsiyalar
-- ---------------------------------------------------------------------
alter table visits add column if not exists mood text;
alter table visits drop constraint if exists visits_status_check;
alter table visits add constraint visits_status_check
  check (status in ('planned', 'confirmed', 'arrived', 'completed', 'no_show', 'moved', 'cancelled', 'booked'));

create table visit_items (
  id            uuid primary key default gen_random_uuid(),
  visit_id      uuid not null references visits(id) on delete cascade,
  price_item_id uuid references price_items(id) on delete set null,
  name          text not null,
  price         bigint not null default 0 check (price >= 0)
);
create index on visit_items (visit_id);

-- ---------------------------------------------------------------------
-- Bemor kartasi: "Yangi bemor" formasidagi qo'shimcha maydonlar
-- ---------------------------------------------------------------------
alter table patients
  add column if not exists email            text,
  add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  add column if not exists curator_id       uuid references users(id),
  add column if not exists contact_channel  text check (contact_channel in ('call', 'tg', 'sms', 'wa')),
  add column if not exists payer            text,
  add column if not exists registered_on    date not null default current_date,
  add column if not exists photo_file_id    uuid references record_files(id) on delete set null;
