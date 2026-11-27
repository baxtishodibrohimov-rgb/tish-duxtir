-- Shifokor ulushi: praysda % yoki so'm, to'lovga proporsional, davr bo'yicha.
\set ON_ERROR_STOP 1
insert into users (id, email, password_hash, full_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'ds-owner@test', 'x', 'Ega'),
  ('00000000-0000-0000-0000-0000000000d2', 'ds-doc@test', 'x', 'Shifokor');
select set_config('app.user_id', '00000000-0000-0000-0000-0000000000d1', false);
insert into orgs (id, name, doctor_share_percent) values ('1d000000-0000-0000-0000-000000000001', 'DS klinika', 30);
insert into branches (id, org_id, name) values ('bd000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'Markaz');
insert into members (org_id, user_id, role, full_name) values ('1d000000-0000-0000-0000-000000000001', app_uid(), 'owner', 'Ega'),
  ('1d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', 'doctor', 'Shifokor');
insert into price_categories (id, org_id, name) values ('cd000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'Ortopediya');
insert into price_items (id, org_id, category_id, name, price, doctor_share_type, doctor_share) values
  ('1f000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', 'Toj', 1000000, 'pct', 25),
  ('1f000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', 'Metallokeramika', 1200000, 'sum', 150000),
  ('1f000000-0000-0000-0000-000000000003', '1d000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', 'Plomba', 300000, null, null);
insert into patients (id, org_id, card_number, last_name, first_name) values
  ('9d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', '1', 'Aliyev', 'Vali');
insert into acts (id, org_id, branch_id, patient_id, doctor_id, act_date, status, discount) values
  ('ad000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', '2026-03-01', 'draft', 100000);
insert into act_items (act_id, price_item_id, name, qty, price) values
  ('ad000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000001', 'Toj', 1, 1000000),
  ('ad000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000002', 'Metallokeramika', 3, 1200000),
  ('ad000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000003', 'Plomba', 1, 300000);
update acts set status = 'closed' where id = 'ad000000-0000-0000-0000-000000000001';
do $$ begin
  -- Toj 25% × 1 000 000 = 250 000 (chegirma hisobga olinmaydi); MK 150 000 × 3 = 450 000; Plomba umumiy 30% = 90 000.
  assert (select array_agg(doctor_amount order by price desc) from act_items where act_id = 'ad000000-0000-0000-0000-000000000001') = '{450000,250000,90000}', 'ulushlar';
end $$;
\echo OK: prays bo‘yicha ulush (%, so‘m, umumiy)

-- Prays o'zgarsa — eski ish o'zgarmaydi.
update price_items set doctor_share = 50 where id = '1f000000-0000-0000-0000-000000000001';
do $$ begin assert (select sum(doctor_amount) from act_items where act_id = 'ad000000-0000-0000-0000-000000000001') = 790000, 'muzlatilgan'; end $$;
\echo OK: prays o‘zgarishi eski ishga ta’sir qilmaydi

-- Akt jami: 1 000 000 + 3 600 000 + 300 000 − 100 000 = 4 800 000. Mart oyida 2 400 000 (yarmi), aprelda qolgani.
create temp table bx as select id from cashboxes where branch_id = 'bd000000-0000-0000-0000-000000000001' limit 1;
insert into money_moves (org_id, kind, cashbox_id, amount, patient_id, moved_at) values
  ('1d000000-0000-0000-0000-000000000001', 'income', (select id from bx), 2400000, '9d000000-0000-0000-0000-000000000001', '2026-03-05 12:00+05'),
  ('1d000000-0000-0000-0000-000000000001', 'income', (select id from bx), 2400000, '9d000000-0000-0000-0000-000000000001', '2026-04-02 12:00+05');
do $$ declare m bigint; a bigint; t bigint; begin
  select sum(earned) into m from doctor_earned_period('1d000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001', '2026-03-01', '2026-03-31');
  select sum(earned) into a from doctor_earned_period('1d000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001', '2026-04-01', '2026-04-30');
  select sum(earned) into t from doctor_earned_period('1d000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001', '2026-01-01', '2026-12-31');
  assert m = 395000, format('mart yarmi 395000, %s', m);
  assert a = 395000, format('aprel 395000, %s', a);
  assert t = 790000, format('yil 790000, %s', t);
end $$;
\echo OK: davr bo‘yicha — yarim to‘lov yarim ulush, jami to‘liq
