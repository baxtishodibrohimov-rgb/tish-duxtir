-- =====================================================================
-- Laboratoriya (ortopediya): buyurtmalar, holatlar, texnik ulushi
--   * Prays: ish "laboratoriya ishi" bo'lsa — texnik narxi (1 tish uchun).
--   * "Material xarajat"da lab ishi tanlansa — buyurtma yaratiladi (texnik, ma'sul, rang, qolip, muddat).
--   * Texnikka pul bemor to'lagan sari proporsional yoziladi (act_paid ko'rinishi orqali hisoblanadi).
-- =====================================================================

alter table price_items add column if not exists is_lab boolean not null default false;
alter table price_items add column if not exists tech_price bigint not null default 0 check (tech_price >= 0);

-- Muddatdan necha kun oldin qo'ng'iroqchada "texnikdan xabar oling" chiqadi.
alter table orgs add column if not exists lab_warn_days int not null default 2 check (lab_warn_days between 0 and 60);

create table if not exists lab_orders (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  branch_id      uuid not null references branches(id),
  number         int not null,
  patient_id     uuid not null references patients(id) on delete cascade,
  act_id         uuid references acts(id) on delete set null,
  price_item_id  uuid references price_items(id) on delete set null,
  work_name      text not null,
  tooth          text,
  qty            int not null default 1 check (qty > 0),
  technician_id  uuid not null references counterparties(id),
  responsible_id uuid not null references users(id),
  doctor_id      uuid references users(id),
  shade          text,
  impression     text not null check (impression in ('scan', 'cast')),
  due_date       date not null,
  status         text not null default 'to_send'
                 check (status in ('to_send', 'at_lab', 'remake', 'ready', 'delivered', 'cancelled')),
  tech_amount    bigint not null default 0 check (tech_amount >= 0),   -- texnik narxi × tishlar soni
  note           text,
  sent_at        timestamptz,
  ready_at       timestamptz,
  delivered_at   timestamptz,
  checked_at     timestamptz,     -- ma'sul "texnikdan xabar oldim" bosgan vaqt
  created_by     uuid default app_uid() references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, number)
);
create index if not exists lab_orders_branch on lab_orders (branch_id, status);
create index if not exists lab_orders_patient on lab_orders (patient_id);
create index if not exists lab_orders_tech on lab_orders (technician_id);
create index if not exists lab_orders_act on lab_orders (act_id);

-- Holat tarixi: kim, qachon, nima qildi.
create table if not exists lab_order_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  order_id   uuid not null references lab_orders(id) on delete cascade,
  status     text,          -- yangi holat (yoki null — izoh/xabar)
  action     text not null default 'status' check (action in ('created', 'status', 'checked', 'edit')),
  note       text,
  by_user    uuid default app_uid() references users(id) on delete set null,
  at         timestamptz not null default now()
);
create index if not exists lab_order_events_order on lab_order_events (order_id, at);

-- Tartib raqami: tashkilot ichida 1, 2, 3...
create or replace function lab_orders_number() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('lab_orders:' || new.org_id::text));
  select coalesce(max(number), 0) + 1 into new.number from lab_orders where org_id = new.org_id;
  return new;
end $$;
drop trigger if exists lab_orders_number on lab_orders;
create trigger lab_orders_number before insert on lab_orders for each row execute function lab_orders_number();

-- Akt bekor qilinsa — buyurtma ham bekor bo'ladi (texnikka pul yozilmaydi).
create or replace function act_cancel_lab() returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into lab_order_events (org_id, order_id, status, note)
    select org_id, id, 'cancelled', 'Akt bekor qilindi' from lab_orders where act_id = new.id and status <> 'cancelled';
    update lab_orders set status = 'cancelled', updated_at = now() where act_id = new.id and status <> 'cancelled';
  end if;
  return new;
end $$;
drop trigger if exists acts_cancel_lab on acts;
create trigger acts_cancel_lab after update of status on acts for each row execute function act_cancel_lab();

-- ---------------------------------------------------------------------
-- Har bir yopilgan akt bo'yicha bemor qancha to'lagan.
--   1) Aktga bog'langan to'lovlar (qaytarishlar ayirilib) — o'sha aktga, akt summasidan oshmasdan.
--   2) Qolgan pul (aktsiz to'lovlar, ortiqchasi) — bemorning eng eski to'lanmagan aktlariga navbat bilan.
-- ---------------------------------------------------------------------
create or replace view act_paid as
with t as (
  select a.id as act_id, a.org_id, a.patient_id, a.act_date, a.created_at,
         greatest(0, coalesce((select sum(ai.qty * ai.price) from act_items ai where ai.act_id = a.id), 0) - a.discount)::bigint as total,
         coalesce((select sum(case when m.kind = 'income' then m.amount when m.kind = 'refund' then -m.amount else 0 end)
                     from money_moves m where m.act_id = a.id), 0)::bigint as direct_raw
    from acts a
   where a.status = 'closed'
), d as (
  select t.*, least(t.total, greatest(0, t.direct_raw)) as direct from t
), p as (
  select m.patient_id, sum(case when m.kind = 'income' then m.amount when m.kind = 'refund' then -m.amount else 0 end)::bigint as paid
    from money_moves m where m.patient_id is not null and m.kind in ('income', 'refund')
   group by m.patient_id
), f as (
  select d.*,
         greatest(0, coalesce(p.paid, 0) - sum(d.direct) over (partition by d.patient_id)) as pool,
         coalesce(sum(d.total - d.direct) over (partition by d.patient_id order by d.act_date, d.created_at, d.act_id
                                                rows between unbounded preceding and 1 preceding), 0) as before
    from d left join p on p.patient_id = d.patient_id
)
select act_id, org_id, patient_id, total,
       (direct + least(total - direct, greatest(0, pool - before)))::bigint as paid
  from f;

-- Buyurtma bo'yicha texnikka tegadigan summa: tech_amount × (to'langan / akt summasi).
create or replace view lab_order_earned as
select o.id as order_id, o.org_id, o.technician_id, o.tech_amount,
       ap.total as act_total, coalesce(ap.paid, 0) as act_paid,
       case
         when o.status = 'cancelled' then 0
         when ap.act_id is null then 0
         when ap.total = 0 then o.tech_amount
         else round(o.tech_amount::numeric * least(ap.paid, ap.total) / ap.total)
       end::bigint as earned
  from lab_orders o
  left join act_paid ap on ap.act_id = o.act_id;
