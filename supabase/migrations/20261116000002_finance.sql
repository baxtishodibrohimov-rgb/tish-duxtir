-- =====================================================================
-- Moliya: kassalar, kontragentlar, xarajat turlari, pul harakati, valyuta kursi
-- =====================================================================

create table public.cashboxes (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name      text not null,
  method    text not null default 'cash' check (method in ('cash', 'terminal', 'click', 'bank', 'other')),
  position  int  not null default 0,
  archived  boolean not null default false
);

-- Bitta kontragentlar jadvali. Kassada hamma turlar ko'rinadi,
-- Omborda faqat type = 'supplier' (yetkazib beruvchi).
create table public.counterparties (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  type       text not null default 'other' check (type in ('supplier', 'doctor', 'assistant', 'lab', 'technician', 'other')),
  name       text not null,
  phone      text,
  email      text,
  address    text,
  contact_person text,
  inn        text,             -- STIR
  bank_name  text,
  bank_account text,
  mfo        text,
  note       text,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.counterparties (clinic_id, type);

create table public.expense_categories (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name      text not null,
  archived  boolean not null default false
);

-- Har bir pul harakati — bitta yozuv.
--   income   : bemor to'lovi (patient_id) yoki boshqa kirim
--   expense  : xarajat (category_id, counterparty_id bo'lishi mumkin)
--   transfer : kassadan kassaga (cashbox_id -> to_cashbox_id)
--   refund   : bemorga qaytarilgan pul
create table public.money_moves (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  kind            text not null check (kind in ('income', 'expense', 'transfer', 'refund')),
  cashbox_id      uuid not null references public.cashboxes(id),
  to_cashbox_id   uuid references public.cashboxes(id),
  amount          bigint not null check (amount > 0),
  patient_id      uuid references public.patients(id) on delete set null,
  doctor_id       uuid references auth.users(id),
  act_id          uuid references public.acts(id) on delete set null,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  category_id     uuid references public.expense_categories(id) on delete set null,
  stock_doc_id    uuid,          -- yetkazib beruvchiga to'lov qaysi nakladnoy uchun (FK 003 da)
  note            text,
  moved_at        timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  check ((kind = 'transfer') = (to_cashbox_id is not null)),
  check (to_cashbox_id is null or to_cashbox_id <> cashbox_id)
);
create index on public.money_moves (clinic_id, moved_at);
create index on public.money_moves (patient_id);

create table public.currency_rates (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  currency  text not null default 'USD',
  rate      numeric(14,2) not null check (rate > 0),
  rate_date date not null default current_date,
  unique (clinic_id, currency, rate_date)
);

-- Kassa qoldiqlari.
create or replace view public.cashbox_balances with (security_invoker = true) as
select c.id as cashbox_id, c.clinic_id, c.name, c.method,
       coalesce(sum(case
         when m.kind = 'income' and m.cashbox_id = c.id then m.amount
         when m.kind in ('expense', 'refund') and m.cashbox_id = c.id then -m.amount
         when m.kind = 'transfer' and m.cashbox_id = c.id then -m.amount
         when m.kind = 'transfer' and m.to_cashbox_id = c.id then m.amount
         else 0 end), 0)::bigint as balance
  from public.cashboxes c
  left join public.money_moves m on m.cashbox_id = c.id or m.to_cashbox_id = c.id
 group by c.id;

-- Bemor balansi: qilingan ish (yopilgan aktlar) va to'langan pul.
create or replace view public.patient_balances with (security_invoker = true) as
select p.id as patient_id, p.clinic_id,
       coalesce((select sum(ai.qty * ai.price) from public.acts a join public.act_items ai on ai.act_id = a.id
                  where a.patient_id = p.id and a.status = 'closed'), 0)
     - coalesce((select sum(a.discount) from public.acts a where a.patient_id = p.id and a.status = 'closed'), 0) as billed,
       coalesce((select sum(case when m.kind = 'income' then m.amount when m.kind = 'refund' then -m.amount else 0 end)
                   from public.money_moves m where m.patient_id = p.id), 0) as paid
  from public.patients p;
