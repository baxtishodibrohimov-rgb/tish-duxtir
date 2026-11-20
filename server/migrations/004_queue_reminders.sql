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

-- ---------------------------------------------------------------------
-- Davolash rejalari: bosqichlar va qatorlar bitta jsonb ustunida.
--   stages = [{ id, name, doctor_id, formula, rows: [{ id, price_item_id, name, zone, price,
--               disc, dtype ('%'|'sum'), status ('none'|'planned'|'done'), pdate, ddate, ddoc, act_id }] }]
-- ---------------------------------------------------------------------
alter table treatment_plans
  add column if not exists kind       text not null default 'plan' check (kind in ('plan', 'act')),
  add column if not exists approved   boolean not null default false,
  add column if not exists note       text,
  add column if not exists plan_date  date not null default current_date,
  add column if not exists show_price boolean not null default true,
  add column if not exists stages     jsonb not null default '[]'::jsonb;

-- Eski qatorlarni bitta bosqichga ko'chiramiz.
update treatment_plans p set stages = jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'name', 'Asosiy bosqich', 'doctor_id', p.doctor_id, 'formula', 'tooth',
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'price_item_id', i.price_item_id, 'name', i.name,
              'zone', coalesce(i.tooth, ''), 'price', i.price * i.qty, 'disc', p.discount_percent, 'dtype', '%', 'status', 'none') order by i.id)
            from treatment_plan_items i where i.plan_id = p.id), '[]'::jsonb)))
 where exists (select 1 from treatment_plan_items i where i.plan_id = p.id);
update treatment_plans set approved = true where status = 'accepted';

create table plan_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null,
  stages     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Bemor kartasi: izohlar (vizitlar tasmasida).
create table patient_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  note_date  date not null default current_date,
  text       text not null,
  created_by uuid default app_uid() references users(id),
  created_at timestamptz not null default now()
);
create index on patient_notes (patient_id);
