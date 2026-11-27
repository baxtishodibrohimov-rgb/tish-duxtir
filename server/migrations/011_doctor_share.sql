-- =====================================================================
-- Shifokor ulushi har bir ish uchun alohida (praysda % yoki so'm)
--   * price_items.doctor_share_type: 'pct' — ish narxidan foiz, 'sum' — 1 tish (1 dona) uchun so'm;
--     bo'sh bo'lsa — umumiy foiz (orgs.doctor_share_percent).
--   * act_items.doctor_amount: ulush ish yozilgan paytda "muzlatiladi" — keyin prays o'zgarsa ham eski ishlar o'zgarmaydi.
--   * Shifokorga pul bemor to'lagan sari yoziladi: doctor_amount × (to'langan / akt summasi).
-- =====================================================================

alter table price_items add column if not exists doctor_share_type text check (doctor_share_type in ('pct', 'sum'));
alter table price_items add column if not exists doctor_share numeric(14, 2) check (doctor_share >= 0);
alter table price_items drop constraint if exists price_items_doctor_share_pct;
alter table price_items add constraint price_items_doctor_share_pct check (doctor_share_type is distinct from 'pct' or doctor_share <= 100);

alter table act_items add column if not exists doctor_amount bigint;

create or replace function act_item_doctor_amount(_org uuid, _item uuid, _price bigint, _qty numeric) returns bigint
language sql stable as $$
  select round(case
           when pi.doctor_share_type = 'sum' then coalesce(pi.doctor_share, 0) * _qty
           when pi.doctor_share_type = 'pct' then _price * _qty * coalesce(pi.doctor_share, 0) / 100
           else _price * _qty * coalesce(o.doctor_share_percent, 30) / 100
         end)::bigint
    from orgs o left join price_items pi on pi.id = _item
   where o.id = _org
$$;

create or replace function act_items_doctor_amount() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price or new.qty is distinct from old.qty
     or new.price_item_id is distinct from old.price_item_id then
    new.doctor_amount := act_item_doctor_amount((select org_id from acts where id = new.act_id), new.price_item_id, new.price, new.qty);
  end if;
  return new;
end $$;
drop trigger if exists act_items_doctor_amount on act_items;
create trigger act_items_doctor_amount before insert or update on act_items for each row execute function act_items_doctor_amount();

-- Avvalgi ishlar: hozirgi umumiy foiz bo'yicha (prays qoidasi emas — tarix o'zgarmasin).
update act_items ai set doctor_amount = round(ai.price * ai.qty * coalesce(o.doctor_share_percent, 30) / 100)
  from acts a join orgs o on o.id = a.org_id
 where a.id = ai.act_id and ai.doctor_amount is null;

-- ---------------------------------------------------------------------
-- Akt bo'yicha to'langan summa ma'lum bir paytgacha (act_paid ko'rinishining sanali varianti).
--   _at gacha bo'lgan to'lovlar va _at gacha sanasi kelgan yopilgan aktlar hisobga olinadi.
-- ---------------------------------------------------------------------
create or replace function act_paid_at(_org uuid, _at timestamptz)
returns table (act_id uuid, patient_id uuid, branch_id uuid, doctor_id uuid, total bigint, paid bigint, doctor_total bigint)
language sql stable as $$
  with t as (
    select a.id as act_id, a.patient_id, a.branch_id, a.doctor_id, a.act_date, a.created_at,
           greatest(0, coalesce((select sum(ai.qty * ai.price) from act_items ai where ai.act_id = a.id), 0) - a.discount)::bigint as total,
           coalesce((select sum(ai.doctor_amount) from act_items ai where ai.act_id = a.id), 0)::bigint as doctor_total,
           coalesce((select sum(case when m.kind = 'income' then m.amount when m.kind = 'refund' then -m.amount else 0 end)
                       from money_moves m where m.act_id = a.id and m.moved_at < _at), 0)::bigint as direct_raw
      from acts a
     where a.org_id = _org and a.status = 'closed' and (a.act_date::timestamp at time zone 'Asia/Tashkent') < _at
  ), d as (
    select t.*, least(t.total, greatest(0, t.direct_raw)) as direct from t
  ), p as (
    select m.patient_id, sum(case when m.kind = 'income' then m.amount when m.kind = 'refund' then -m.amount else 0 end)::bigint as paid
      from money_moves m where m.org_id = _org and m.patient_id is not null and m.kind in ('income', 'refund') and m.moved_at < _at
     group by m.patient_id
  ), f as (
    select d.*,
           greatest(0, coalesce(p.paid, 0) - sum(d.direct) over (partition by d.patient_id)) as pool,
           coalesce(sum(d.total - d.direct) over (partition by d.patient_id order by d.act_date, d.created_at, d.act_id
                                                  rows between unbounded preceding and 1 preceding), 0) as before
      from d left join p on p.patient_id = d.patient_id
  )
  select act_id, patient_id, branch_id, doctor_id, total,
         (direct + least(total - direct, greatest(0, pool - before)))::bigint as paid, doctor_total
    from f
$$;

-- Davr ichida shifokorga yozilgan summa — har bir akt bo'yicha (davr oxiridagi − davr boshidagi).
create or replace function doctor_earned_period(_org uuid, _branch uuid, _from date, _to date)
returns table (act_id uuid, patient_id uuid, doctor_id uuid, total bigint, doctor_total bigint, paid_before bigint, paid_after bigint, earned bigint)
language sql stable as $$
  with b as (select * from act_paid_at(_org, _from::timestamp at time zone 'Asia/Tashkent') where branch_id = _branch),
       e as (select * from act_paid_at(_org, (_to + 1)::timestamp at time zone 'Asia/Tashkent') where branch_id = _branch),
       x as (
         select e.act_id, e.patient_id, e.doctor_id, e.total, e.doctor_total, coalesce(b.paid, 0) as paid_before, e.paid as paid_after,
                case when e.total = 0 then e.doctor_total else round(e.doctor_total::numeric * least(e.paid, e.total) / e.total) end
              - case when b.act_id is null then 0 when b.total = 0 then b.doctor_total else round(b.doctor_total::numeric * least(b.paid, b.total) / b.total) end as earned
           from e left join b on b.act_id = e.act_id
       )
  select act_id, patient_id, doctor_id, total, doctor_total, paid_before, paid_after, earned::bigint
    from x where earned <> 0 or paid_after <> paid_before
$$;
