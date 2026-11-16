-- =====================================================================
-- Moliya: kassalar, kontragentlar, xarajat turlari, pul harakati, valyuta kursi
-- =====================================================================

create table cashboxes (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  name      text not null,
  method    text not null default 'cash' check (method in ('cash', 'terminal', 'click', 'bank', 'other')),
  position  int  not null default 0,
  archived  boolean not null default false
);

-- Bitta kontragentlar jadvali. Kassada hamma turlar ko'rinadi,
-- Omborda faqat type = 'supplier' (yetkazib beruvchi).
create table counterparties (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
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
create index on counterparties (org_id, type);

create table expense_categories (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  name      text not null,
  archived  boolean not null default false
);

-- Har bir pul harakati — bitta yozuv.
--   income   : bemor to'lovi (patient_id) yoki boshqa kirim
--   expense  : xarajat (category_id, counterparty_id bo'lishi mumkin)
--   transfer : kassadan kassaga (cashbox_id -> to_cashbox_id)
--   refund   : bemorga qaytarilgan pul
create table money_moves (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  branch_id       uuid not null references branches(id),     -- cashbox_id filiali
  kind            text not null check (kind in ('income', 'expense', 'transfer', 'refund')),
  cashbox_id      uuid not null references cashboxes(id),
  to_cashbox_id   uuid references cashboxes(id),
  amount          bigint not null check (amount > 0),
  patient_id      uuid references patients(id) on delete set null,
  doctor_id       uuid references users(id),
  act_id          uuid references acts(id) on delete set null,
  counterparty_id uuid references counterparties(id) on delete set null,
  category_id     uuid references expense_categories(id) on delete set null,
  stock_doc_id    uuid,          -- yetkazib beruvchiga to'lov qaysi nakladnoy uchun (FK 003 da)
  note            text,
  moved_at        timestamptz not null default now(),
  created_by      uuid default app_uid() references users(id),
  created_at      timestamptz not null default now(),
  check ((kind = 'transfer') = (to_cashbox_id is not null)),
  check (to_cashbox_id is null or to_cashbox_id <> cashbox_id)
);
create index on money_moves (branch_id, moved_at);
create index on money_moves (patient_id);

create table currency_rates (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  currency  text not null default 'USD',
  rate      numeric(14,2) not null check (rate > 0),
  rate_date date not null default current_date,
  unique (org_id, currency, rate_date)
);

-- Kassa qoldiqlari.
create or replace view cashbox_balances as
select c.id as cashbox_id, c.org_id, c.branch_id, c.name, c.method,
       coalesce(sum(case
         when m.kind = 'income' and m.cashbox_id = c.id then m.amount
         when m.kind in ('expense', 'refund') and m.cashbox_id = c.id then -m.amount
         when m.kind = 'transfer' and m.cashbox_id = c.id then -m.amount
         when m.kind = 'transfer' and m.to_cashbox_id = c.id then m.amount
         else 0 end), 0)::bigint as balance
  from cashboxes c
  left join money_moves m on m.cashbox_id = c.id or m.to_cashbox_id = c.id
 group by c.id;

-- money_moves.branch_id har doim kassaning filiali bilan bir xil bo'lsin.
create or replace function money_moves_branch()
returns trigger language plpgsql as $$
begin
  select branch_id into new.branch_id from cashboxes where id = new.cashbox_id;
  return new;
end $$;
create trigger money_moves_branch before insert or update of cashbox_id on money_moves
  for each row execute function money_moves_branch();

-- Bemor balansi: qilingan ish (yopilgan aktlar) va to'langan pul.
create or replace view patient_balances as
select p.id as patient_id, p.org_id,
       coalesce((select sum(ai.qty * ai.price) from acts a join act_items ai on ai.act_id = a.id
                  where a.patient_id = p.id and a.status = 'closed'), 0)
     - coalesce((select sum(a.discount) from acts a where a.patient_id = p.id and a.status = 'closed'), 0) as billed,
       coalesce((select sum(case when m.kind = 'income' then m.amount when m.kind = 'refund' then -m.amount else 0 end)
                   from money_moves m where m.patient_id = p.id), 0) as paid
  from patients p;
