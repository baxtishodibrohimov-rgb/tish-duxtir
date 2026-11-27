-- Laboratoriya: texnik ulushi to'lovga proporsional, akt bekor qilinsa — buyurtma ham bekor.
\set ON_ERROR_STOP 1
insert into users (id, email, password_hash, full_name) values
  ('00000000-0000-0000-0000-00000000000a', 'lab-owner@test', 'x', 'Ega');
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000a', false);
insert into orgs (id, name) values ('1a000000-0000-0000-0000-000000000001', 'Lab klinika');
insert into branches (id, org_id, name) values ('ba000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'Markaz');
insert into members (org_id, user_id, role, full_name) values ('1a000000-0000-0000-0000-000000000001', app_uid(), 'owner', 'Ega');
insert into counterparties (id, org_id, type, name) values ('3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'technician', 'Texnik Akmal');
insert into price_categories (id, org_id, name) values ('ca000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'Ortopediya');
insert into price_items (id, org_id, category_id, name, price, is_lab, tech_price) values
  ('1e000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Metallokeramika', 1200000, true, 400000),
  ('1e000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Plomba', 300000, false, 0);
insert into patients (id, org_id, card_number, last_name, first_name) values
  ('9a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', '1', 'Aliyev', 'Vali');

-- 1-akt (eski): plomba 300 000. 2-akt: metallokeramika × 3 = 3 600 000, texnik 1 200 000.
insert into acts (id, org_id, branch_id, patient_id, act_date, status) values
  ('ac000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '2026-01-01', 'draft'),
  ('ac000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '2026-01-05', 'draft');
insert into act_items (act_id, price_item_id, name, qty, price) values
  ('ac000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000002', 'Plomba', 1, 300000),
  ('ac000000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000001', 'Metallokeramika', 3, 1200000);
update acts set status = 'closed' where org_id = '1a000000-0000-0000-0000-000000000001';

insert into lab_orders (id, org_id, branch_id, patient_id, act_id, price_item_id, work_name, tooth, qty, technician_id, responsible_id, impression, due_date, tech_amount)
values ('0a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001',
        'ac000000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000001', 'Metallokeramika', '14, 15, 16', 3,
        '3a000000-0000-0000-0000-000000000001', app_uid(), 'scan', '2026-01-12', 1200000);

create temp table box as select id from cashboxes where branch_id = 'ba000000-0000-0000-0000-000000000001' limit 1;
create or replace function pg_temp.earned() returns bigint language sql as
  $$ select earned from lab_order_earned where order_id = '0a000000-0000-0000-0000-000000000001' $$;
create or replace function pg_temp.pay(_kind text, _amt bigint, _act uuid) returns void language sql as $$
  insert into money_moves (org_id, kind, cashbox_id, amount, patient_id, act_id)
  values ('1a000000-0000-0000-0000-000000000001', _kind, (select id from box), _amt, '9a000000-0000-0000-0000-000000000001', _act) $$;

do $$ begin
  assert (select number from lab_orders where id = '0a000000-0000-0000-0000-000000000001') = 1, 'raqam 1';
  assert pg_temp.earned() = 0, 'to''lovsiz — 0';
end $$;
\echo OK: buyurtma raqami va to‘lovsiz holat

-- Aktsiz to'lov 300 000 — avval eski aktni (plomba) yopadi, texnikka hech narsa.
select pg_temp.pay('income', 300000, null);
do $$ begin assert pg_temp.earned() = 0, format('eski akt avval yopiladi, earned=%s', pg_temp.earned()); end $$;
\echo OK: aktsiz to‘lov eng eski aktga

-- Yana aktsiz 1 800 000 — 2-aktning yarmi → 600 000.
select pg_temp.pay('income', 1800000, null);
do $$ begin assert pg_temp.earned() = 600000, format('yarim to''lov — 600000, earned=%s', pg_temp.earned()); end $$;
\echo OK: yarim to‘lov — yarim ulush

-- 2-aktga bog'langan 1 800 000 → to'liq.
select pg_temp.pay('income', 1800000, 'ac000000-0000-0000-0000-000000000002');
do $$ begin assert pg_temp.earned() = 1200000, format('to''liq — 1200000, earned=%s', pg_temp.earned()); end $$;
\echo OK: to‘liq to‘lov — to‘liq ulush

-- Ortiqcha to'lov ulushni oshirmaydi; qaytarish kamaytiradi.
select pg_temp.pay('income', 500000, 'ac000000-0000-0000-0000-000000000002');
do $$ begin assert pg_temp.earned() = 1200000, 'ortiqcha to''lov — baribir 1200000'; end $$;
select pg_temp.pay('refund', 2300000, 'ac000000-0000-0000-0000-000000000002');
do $$ begin assert pg_temp.earned() = 600000, format('qaytarishdan keyin 600000, earned=%s', pg_temp.earned()); end $$;
\echo OK: ortiqcha to‘lov va qaytarish

-- Akt bekor qilinsa — buyurtma bekor, ulush 0.
update acts set status = 'cancelled' where id = 'ac000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select status from lab_orders where id = '0a000000-0000-0000-0000-000000000001') = 'cancelled', 'buyurtma bekor';
  assert pg_temp.earned() = 0, 'bekor — 0';
  assert (select count(*) from lab_order_events where order_id = '0a000000-0000-0000-0000-000000000001' and status = 'cancelled') = 1, 'tarixda bor';
end $$;
\echo OK: akt bekor — buyurtma bekor
