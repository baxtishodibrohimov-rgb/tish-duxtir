-- Ombor mantiqi sinovi. Ishga tushirish: psql -d <db> -f supabase/tests/warehouse_test.sql
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test', '{"full_name":"Ega"}'),
  ('00000000-0000-0000-0000-000000000002', 'asst@test',  '{"full_name":"Assistent"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

insert into clinics (id, owner_id, name) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Sinov klinika');
do $$ begin
  assert (select count(*) from clinic_members) = 1, 'egasi a''zo bo''lishi kerak';
  assert (select count(*) from warehouses where is_main) = 1, 'asosiy ombor';
  assert (select count(*) from cashboxes) = 3, '3 kassa';
end $$;

insert into warehouses (id, clinic_id, name) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Kabinet 1');
insert into counterparties (id, clinic_id, type, name) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'supplier', 'Dental Market');
insert into products (id, clinic_id, name, unit, pack_unit, pack_qty) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Filtek Z250', 'gr', 'shprits', 4);

create temp table ids as select
  (select id from warehouses where is_main) main,
  '20000000-0000-0000-0000-000000000002'::uuid cab,
  '40000000-0000-0000-0000-000000000001'::uuid prod,
  '30000000-0000-0000-0000-000000000001'::uuid sup;

-- Kirim 1: 10 gr x 100, Kirim 2: 10 gr x 120
do $$ declare d1 uuid; d2 uuid; i ids; begin
  select * into i from ids;
  insert into stock_docs (clinic_id, type, warehouse_id, counterparty_id) values ('10000000-0000-0000-0000-000000000001', 'receipt', i.main, i.sup) returning id into d1;
  insert into stock_doc_lines (doc_id, product_id, qty, price) values (d1, i.prod, 10, 100);
  perform post_stock_doc(d1);
  insert into stock_docs (clinic_id, type, warehouse_id, counterparty_id) values ('10000000-0000-0000-0000-000000000001', 'receipt', i.main, i.sup) returning id into d2;
  insert into stock_doc_lines (doc_id, product_id, qty, price) values (d2, i.prod, 10, 120);
  perform post_stock_doc(d2);
  assert (select qty from stock_balances where product_id = i.prod and warehouse_id = i.main) = 20, 'qoldiq 20';
  assert (select value from stock_balances where product_id = i.prod and warehouse_id = i.main) = 2200, 'summa 2200';
  assert (select number from stock_docs where id = d2) ~ '^\d{4}-0000000002$', 'raqam formati';
  raise notice 'OK: kirim, raqam %', (select number from stock_docs where id = d2);
end $$;

-- Ko'chirish 15 gr asosiy -> kabinet: FIFO bo'yicha 10x100 + 5x120 = 1600
do $$ declare d uuid; i ids; begin
  select * into i from ids;
  insert into stock_docs (clinic_id, type, warehouse_id, to_warehouse_id) values ('10000000-0000-0000-0000-000000000001', 'transfer', i.main, i.cab) returning id into d;
  insert into stock_doc_lines (doc_id, product_id, qty) values (d, i.prod, 15);
  perform post_stock_doc(d);
  assert (select value from stock_balances where product_id = i.prod and warehouse_id = i.cab) = 1600, 'kabinet summa 1600';
  assert (select value from stock_balances where product_id = i.prod and warehouse_id = i.main) = 600, 'asosiy summa 600';
  -- o'tkazilgan hujjatni o'chirib/tahrirlab bo'lmaydi
  begin delete from stock_docs where id = d; raise exception 'xato: o''chdi'; exception when raise_exception then
    if sqlerrm like 'xato:%' then raise; end if; end;
  begin update stock_doc_lines set qty = 1 where doc_id = d; raise exception 'xato: tahrirlandi'; exception when raise_exception then
    if sqlerrm like 'xato:%' then raise; end if; end;
  raise notice 'OK: ko''chirish FIFO, himoya';
end $$;

-- Hisobdan chiqarish 7 gr kabinetdan (5 bor bo'lgan 100-lik + 2 ta 120-lik): manfiy emas
-- Kabinetdagi partiyalar: 10x100, 5x120. 12 chiqaramiz -> 10x100 + 2x120 = 1240
do $$ declare d uuid; i ids; begin
  select * into i from ids;
  insert into stock_docs (clinic_id, type, warehouse_id, reason) values ('10000000-0000-0000-0000-000000000001', 'writeoff', i.cab, 'usage') returning id into d;
  insert into stock_doc_lines (doc_id, product_id, qty) values (d, i.prod, 12);
  perform post_stock_doc(d);
  assert (select cost from stock_moves where doc_id = d) = -1240, 'chiqim tannarxi 1240';
  -- Storno: partiyalar qaytadi
  perform reverse_stock_doc(d);
  assert (select status from stock_docs where id = d) = 'reversed';
  assert (select qty from stock_balances where product_id = i.prod and warehouse_id = i.cab) = 15, 'storno qoldiq';
  assert (select value from stock_balances where product_id = i.prod and warehouse_id = i.cab) = 1600, 'storno summa';
  raise notice 'OK: chiqim FIFO va storno';
end $$;

-- Ishlatilgan kirimni bekor qilib bo'lmaydi
do $$ declare d uuid; i ids; begin
  select * into i from ids;
  select id into d from stock_docs where type = 'receipt' order by number limit 1;
  begin perform reverse_stock_doc(d); raise exception 'xato: bekor bo''ldi';
  exception when raise_exception then if sqlerrm like 'xato:%' then raise; end if; end;
  raise notice 'OK: ishlatilgan kirim stornosi rad etildi';
end $$;

-- Manfiy qoldiq: asosiyda 5 bor, 8 chiqaramiz -> -3, oxirgi narx 120
do $$ declare d uuid; i ids; begin
  select * into i from ids;
  insert into stock_docs (clinic_id, type, warehouse_id, reason) values ('10000000-0000-0000-0000-000000000001', 'writeoff', i.main, 'broken') returning id into d;
  insert into stock_doc_lines (doc_id, product_id, qty) values (d, i.prod, 8);
  perform post_stock_doc(d);
  assert (select qty from stock_balances where product_id = i.prod and warehouse_id = i.main) = -3, 'manfiy -3';
  assert (select cost from stock_moves where doc_id = d) = -960, '5x120 + 3x120';
  raise notice 'OK: manfiy qoldiq';
end $$;

-- Akt yopilganda kalkulyatsiya kartasi bo'yicha chiqim
do $$ declare pc uuid; pi uuid; pat uuid; a uuid; doc uuid; i ids; begin
  select * into i from ids;
  insert into price_categories (clinic_id, name) values ('10000000-0000-0000-0000-000000000001', 'Terapiya') returning id into pc;
  insert into price_items (clinic_id, category_id, name, price) values ('10000000-0000-0000-0000-000000000001', pc, 'Kompozit plomba', 450000) returning id into pi;
  insert into calc_cards (clinic_id, price_item_id, product_id, qty) values ('10000000-0000-0000-0000-000000000001', pi, i.prod, 0.5);
  insert into patients (clinic_id, first_name, last_name) values ('10000000-0000-0000-0000-000000000001', 'Ali', 'Valiyev') returning id into pat;
  assert (select card_number from patients where id = pat) = '0001', 'karta raqami';
  insert into acts (clinic_id, patient_id, warehouse_id) values ('10000000-0000-0000-0000-000000000001', pat, i.cab) returning id into a;
  insert into act_items (act_id, price_item_id, name, qty, price) values (a, pi, 'Kompozit plomba', 2, 450000);
  doc := close_act(a);
  assert doc is not null, 'chiqim hujjati yaratildi';
  assert (select qty from stock_balances where product_id = i.prod and warehouse_id = i.cab) = 14, '15 - 2x0.5';
  insert into money_moves (clinic_id, kind, cashbox_id, amount, patient_id, act_id)
  values ('10000000-0000-0000-0000-000000000001', 'income', (select id from cashboxes where method = 'cash'), 500000, pat, a);
  assert (select billed - paid from patient_balances where patient_id = pat) = 400000, 'bemor qarzi';
  raise notice 'OK: akt, avtomatik chiqim, bemor balansi';
end $$;

select name, purchased, paid from supplier_debts;

-- Ruxsat: assistent ombor hujjatini o'tkaza olmaydi va kassani ko'rmaydi
reset role;
insert into clinic_members (clinic_id, user_id, role, full_name) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'assistant', 'Assistent');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from money_moves) = 0, 'assistent kassani ko''rmasligi kerak';
  assert (select count(*) from stock_balances) > 0, 'assistent qoldiqni ko''radi';
  begin
    insert into stock_docs (clinic_id, type, warehouse_id, reason) values ('10000000-0000-0000-0000-000000000001', 'writeoff', (select id from warehouses where is_main), 'x');
    raise exception 'xato: assistent hujjat yaratdi';
  exception when insufficient_privilege then null; end;
  raise notice 'OK: ruxsatlar';
end $$;
