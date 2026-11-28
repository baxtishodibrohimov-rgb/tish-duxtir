-- Shifokor ulushi kassaga tushgan to'lovdan, praysga proporsional.
\set ON_ERROR_STOP 1
insert into users (id, email, password_hash, full_name) values ('00000000-0000-0000-0000-0000000000e1', 'ps-owner@test', 'x', 'Ega');
select set_config('app.user_id', '00000000-0000-0000-0000-0000000000e1', false);
insert into orgs (id, name, doctor_share_percent) values ('1e100000-0000-0000-0000-000000000001', 'PS klinika', 30);
insert into branches (id, org_id, name) values ('be100000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001', 'Markaz');
insert into members (org_id, user_id, role, full_name) values ('1e100000-0000-0000-0000-000000000001', app_uid(), 'owner', 'Ega');
insert into price_categories (id, org_id, name) values ('ce100000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001', 'Terapiya');
insert into price_items (id, org_id, category_id, name, price, doctor_share_type, doctor_share) values
  ('1f100000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'Kanal', 350000, 'sum', 120000);
insert into patients (id, org_id, card_number, last_name, first_name) values
  ('9e100000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001', '1', 'Aliyev', 'Vali'),
  ('9e100000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000001', '2', 'Avans', 'Bemor');
create temp table bx as select id from cashboxes where branch_id = 'be100000-0000-0000-0000-000000000001' limit 1;
create or replace function pg_temp.pay(_p uuid, _kind text, _amt bigint, _at timestamptz) returns uuid language sql as $$
  insert into money_moves (org_id, kind, cashbox_id, amount, patient_id, moved_at)
  values ('1e100000-0000-0000-0000-000000000001', _kind, (select id from bx), _amt, _p, _at) returning id $$;
create or replace function pg_temp.share(_d date) returns bigint language sql as $$
  select coalesce(sum(o_share), 0) from payment_doctor_shares('1e100000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001', _d, _d) $$;

insert into acts (id, org_id, branch_id, patient_id, act_date, status, created_at) values
  ('ae100000-0000-0000-0000-000000000001', '1e100000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000001', '2026-05-01', 'draft', '2026-05-01 10:00+05');
insert into act_items (act_id, price_item_id, name, qty, price) values ('ae100000-0000-0000-0000-000000000001', '1f100000-0000-0000-0000-000000000001', 'Kanal', 1, 350000);
update acts set status = 'closed' where id = 'ae100000-0000-0000-0000-000000000001';

select pg_temp.pay('9e100000-0000-0000-0000-000000000001', 'income', 200000, '2026-05-01 12:00+05');
do $$ begin assert pg_temp.share('2026-05-01') = 68571, format('200 000 → 68 571, %s', pg_temp.share('2026-05-01')); end $$;
\echo OK: 350 000 ishdan 200 000 to‘lov → 68 571
select pg_temp.pay('9e100000-0000-0000-0000-000000000001', 'income', 150000, '2026-05-03 12:00+05');
do $$ begin assert pg_temp.share('2026-05-03') = 51429, format('qolgan 150 000 → 51 429, %s', pg_temp.share('2026-05-03')); end $$;
\echo OK: qolgan 150 000 → 51 429 (jami 120 000)
-- Ortiqcha to'lov — ish yopilgan, umumiy 30%.
select pg_temp.pay('9e100000-0000-0000-0000-000000000001', 'income', 100000, '2026-05-04 12:00+05');
do $$ begin assert pg_temp.share('2026-05-04') = 30000, format('ishsiz → 30%%, %s', pg_temp.share('2026-05-04')); end $$;
\echo OK: ishga to‘g‘ri kelmagan to‘lov — umumiy foiz
-- Qaytarish: avval avansdan (−30 000).
select pg_temp.pay('9e100000-0000-0000-0000-000000000001', 'refund', 100000, '2026-05-05 12:00+05');
do $$ begin assert pg_temp.share('2026-05-05') = -30000, format('qaytarish −30 000, %s', pg_temp.share('2026-05-05')); end $$;
\echo OK: qaytarish teskari
-- Avans: ish yo'q paytda 30%, keyin ish yozilsa qayta hisoblanmaydi.
select pg_temp.pay('9e100000-0000-0000-0000-000000000002', 'income', 350000, '2026-05-06 09:00+05');
insert into acts (id, org_id, branch_id, patient_id, act_date, status, created_at) values
  ('ae100000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000002', '2026-05-06', 'draft', '2026-05-06 11:00+05');
insert into act_items (act_id, price_item_id, name, qty, price) values ('ae100000-0000-0000-0000-000000000002', '1f100000-0000-0000-0000-000000000001', 'Kanal', 1, 350000);
update acts set status = 'closed' where id = 'ae100000-0000-0000-0000-000000000002';
do $$ begin assert pg_temp.share('2026-05-06') = 105000, format('avans 30%% = 105 000, %s', pg_temp.share('2026-05-06')); end $$;
\echo OK: avans — umumiy foiz, ish keyin qo‘shilsa ikki marta hisoblanmaydi
