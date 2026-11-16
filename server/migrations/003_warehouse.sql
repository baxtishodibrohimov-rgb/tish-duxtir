-- =====================================================================
-- Ombor (texnik tavsif asosida)
--  * Qoldiq qo'lda tahrirlanmaydi: faqat o'tkazilgan hujjatlardan hisoblanadi.
--  * stock_moves — harakatlar jurnali (yagona haqiqat manbai),
--    stock_balances — tez o'qish uchun kesh.
--  * Tannarx FIFO: stock_lots (partiyalar) va stock_move_lots.
--  * Miqdorlar eng kichik birlikda saqlanadi (dona/ml/gr);
--    qadoq = pack_qty ta birlik.
--  * Hujjat: draft -> posted. O'tkazilgan hujjat o'chirilmaydi —
--    teskari hujjat (storno) bilan tuzatiladi.
-- =====================================================================

create table warehouses (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  branch_id      uuid not null references branches(id) on delete cascade,
  name           text not null,
  responsible_id uuid references users(id),
  is_main        boolean not null default false,
  note           text,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);
-- Har bir filialda faqat bitta asosiy ombor.
create unique index warehouses_one_main on warehouses (branch_id) where is_main;

alter table acts add constraint acts_warehouse_fk
  foreign key (warehouse_id) references warehouses(id) on delete set null;

create table product_categories (
  id        uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  parent_id uuid references product_categories(id) on delete cascade,
  name      text not null,
  position  int  not null default 0
);

create table brands (
  id        uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name      text not null,
  logo_url  text,
  archived  boolean not null default false
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  org_id   uuid not null references orgs(id) on delete cascade,
  category_id uuid references product_categories(id) on delete set null,
  brand_id    uuid references brands(id) on delete set null,
  name        text not null,
  sku         text,
  barcode     text,
  unit        text not null default 'dona',      -- eng kichik birlik: dona, ml, gr, sm ...
  pack_unit   text,                              -- qadoq nomi: quti, shprits, tyubik ...
  pack_qty    numeric(14,3) not null default 1 check (pack_qty > 0),
  last_cost   numeric(16,4) not null default 0,  -- oxirgi kirim narxi (1 birlik uchun)
  note        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on products (org_id, name);

-- Har bir ombor uchun: ko'rinish, kritik qoldiq, buyurtma miqdori, joylashuv.
create table product_wh_settings (
  product_id   uuid not null references products(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  org_id    uuid not null references orgs(id) on delete cascade,
  visible      boolean not null default true,
  min_qty      numeric(14,3) not null default 0,
  order_qty    numeric(14,3) not null default 0,
  location     text,                    -- "1-tortma", "A javon", "Seyf" ...
  primary key (product_id, warehouse_id)
);

create table stock_docs (
  id              uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  type            text not null check (type in ('receipt', 'writeoff', 'transfer', 'return')),
  number          text not null,
  doc_date        date not null default current_date,
  warehouse_id    uuid not null references warehouses(id),
  to_warehouse_id uuid references warehouses(id),
  counterparty_id uuid references counterparties(id),
  responsible_id  uuid references users(id),
  reason          text,               -- hisobdan chiqarish sababi: usage, broken, expired, act, other
  note            text,
  status          text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  reversal_of     uuid references stock_docs(id),
  act_id          uuid references acts(id) on delete set null,
  posted_at       timestamptz,
  created_by      uuid default app_uid() references users(id),
  created_at      timestamptz not null default now(),
  unique (org_id, number),
  check (type <> 'transfer' or (to_warehouse_id is not null and to_warehouse_id <> warehouse_id))
);
create index on stock_docs (org_id, type, doc_date desc);

alter table money_moves add constraint money_moves_stock_doc_fk
  foreign key (stock_doc_id) references stock_docs(id) on delete set null;

create table stock_doc_lines (
  id         uuid primary key default gen_random_uuid(),
  doc_id     uuid not null references stock_docs(id) on delete cascade,
  product_id uuid not null references products(id),
  qty        numeric(14,3) not null check (qty > 0),     -- eng kichik birlikda
  price      numeric(16,4) not null default 0 check (price >= 0), -- 1 birlik narxi (kirim)
  position   int not null default 0
);

create table stock_lots (
  id           uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  product_id   uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  doc_id       uuid not null references stock_docs(id),
  qty_in       numeric(14,3) not null check (qty_in > 0),
  qty_left     numeric(14,3) not null check (qty_left >= 0),
  unit_cost    numeric(16,4) not null,
  received_at  timestamptz not null default now(),
  seq          bigint generated always as identity   -- bir vaqtda kelgan partiyalar tartibi
);
create index on stock_lots (product_id, warehouse_id, received_at, seq) where qty_left > 0;

create table stock_moves (
  id           bigint generated always as identity primary key,
  org_id    uuid not null references orgs(id) on delete cascade,
  product_id   uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  doc_id       uuid not null references stock_docs(id),
  qty          numeric(14,3) not null,      -- + kirim, - chiqim
  cost         numeric(18,4) not null,      -- harakat tannarxi (ishorasi qty bilan bir xil)
  moved_at     timestamptz not null default now()
);
create index on stock_moves (product_id, warehouse_id, moved_at);
create index on stock_moves (doc_id);

create table stock_move_lots (
  move_id   bigint not null references stock_moves(id) on delete cascade,
  lot_id    uuid   not null references stock_lots(id),
  qty       numeric(14,3) not null,
  unit_cost numeric(16,4) not null
);

create table stock_balances (
  product_id   uuid not null references products(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  org_id    uuid not null references orgs(id) on delete cascade,
  qty          numeric(14,3) not null default 0,
  value        numeric(18,4) not null default 0,
  primary key (product_id, warehouse_id)
);

-- Kalkulyatsiya kartasi: xizmat bajarilganda qaysi material qancha chiqadi.
create table calc_cards (
  id            uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  price_item_id uuid not null references price_items(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  qty           numeric(14,3) not null check (qty > 0),
  unique (price_item_id, product_id)
);

-- ---------------------------------------------------------------------
-- Hujjat raqami: YYMM-0000000271 (klinika ichida ketma-ket).
-- ---------------------------------------------------------------------
create or replace function next_stock_doc_number(_org uuid, _date date)
returns text language plpgsql as $$
declare n bigint;
begin
  perform pg_advisory_xact_lock(hashtext('stockdoc:' || _org::text));
  select coalesce(max(split_part(number, '-', 2)::bigint), 0) + 1 into n
    from stock_docs where org_id = _org and number ~ '^\d{4}-\d+$';
  return to_char(_date, 'YYMM') || '-' || lpad(n::text, 10, '0');
end $$;

create or replace function stock_docs_defaults()
returns trigger language plpgsql as $$
begin
  if new.number is null or new.number = '' then
    new.number := next_stock_doc_number(new.org_id, new.doc_date);
  end if;
  if new.responsible_id is null then new.responsible_id := app_uid(); end if;
  return new;
end $$;
create trigger stock_docs_defaults before insert on stock_docs
  for each row execute function stock_docs_defaults();

-- O'tkazilgan hujjatni tahrirlash/o'chirishni taqiqlash.
create or replace function stock_docs_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'O''tkazilgan hujjatni o''chirib bo''lmaydi. Teskari hujjat yarating.'; end if;
    return old;
  end if;
  if old.status <> 'draft' and current_setting('app.posting', true) is distinct from 'on' then
    raise exception 'O''tkazilgan hujjatni tahrirlab bo''lmaydi.';
  end if;
  return new;
end $$;
create trigger stock_docs_guard before update or delete on stock_docs
  for each row execute function stock_docs_guard();

create or replace function stock_lines_guard()
returns trigger language plpgsql as $$
declare s text;
begin
  select status into s from stock_docs where id = coalesce(new.doc_id, old.doc_id);
  if s is distinct from 'draft' then raise exception 'O''tkazilgan hujjat qatorlarini o''zgartirib bo''lmaydi.'; end if;
  return coalesce(new, old);
end $$;
create trigger stock_lines_guard before insert or update or delete on stock_doc_lines
  for each row execute function stock_lines_guard();

-- ---------------------------------------------------------------------
-- Ichki yordamchilar
-- ---------------------------------------------------------------------
create or replace function _stock_bal(_org uuid, _product uuid, _wh uuid, _qty numeric, _cost numeric)
returns void language sql as $$
  insert into stock_balances (product_id, warehouse_id, org_id, qty, value)
  values (_product, _wh, _org, _qty, _cost)
  on conflict (product_id, warehouse_id)
  do update set qty = stock_balances.qty + excluded.qty, value = stock_balances.value + excluded.value;
$$;

-- Kirim: yangi partiya + musbat harakat.
create or replace function _stock_in(_org uuid, _doc uuid, _product uuid, _wh uuid, _qty numeric, _unit_cost numeric, _at timestamptz)
returns void language plpgsql as $$
declare mid bigint; lid uuid;
begin
  insert into stock_lots (org_id, product_id, warehouse_id, doc_id, qty_in, qty_left, unit_cost, received_at)
  values (_org, _product, _wh, _doc, _qty, _qty, _unit_cost, _at) returning id into lid;
  insert into stock_moves (org_id, product_id, warehouse_id, doc_id, qty, cost, moved_at)
  values (_org, _product, _wh, _doc, _qty, _qty * _unit_cost, _at) returning id into mid;
  insert into stock_move_lots (move_id, lot_id, qty, unit_cost) values (mid, lid, _qty, _unit_cost);
  perform _stock_bal(_org, _product, _wh, _qty, _qty * _unit_cost);
end $$;

-- Chiqim (FIFO). Yetmasa va manfiy qoldiqqa ruxsat bo'lsa, qolgani oxirgi narxda yoziladi.
-- Qaytaradi: [{qty, unit_cost}] — ko'chirishda qabul omboriga xuddi shu narxlarda partiya ochish uchun.
create or replace function _stock_out(_org uuid, _doc uuid, _product uuid, _wh uuid, _qty numeric, _at timestamptz)
returns jsonb language plpgsql as $$
declare
  need numeric := _qty; take numeric; total numeric := 0; mid bigint;
  lot record; parts jsonb := '[]'::jsonb; allow boolean; fallback numeric;
begin
  insert into stock_moves (org_id, product_id, warehouse_id, doc_id, qty, cost, moved_at)
  values (_org, _product, _wh, _doc, -_qty, 0, _at) returning id into mid;

  for lot in
    select id, qty_left, unit_cost from stock_lots
     where product_id = _product and warehouse_id = _wh and qty_left > 0
     order by received_at, seq for update
  loop
    exit when need <= 0;
    take := least(need, lot.qty_left);
    update stock_lots set qty_left = qty_left - take where id = lot.id;
    insert into stock_move_lots (move_id, lot_id, qty, unit_cost) values (mid, lot.id, -take, lot.unit_cost);
    total := total + take * lot.unit_cost;
    parts := parts || jsonb_build_object('qty', take, 'unit_cost', lot.unit_cost);
    need := need - take;
  end loop;

  if need > 0 then
    select allow_negative_stock into allow from orgs where id = _org;
    if not allow then
      raise exception 'Omborda yetarli qoldiq yo''q: % (yetishmaydi: %)',
        (select name from products where id = _product), need;
    end if;
    select last_cost into fallback from products where id = _product;
    total := total + need * coalesce(fallback, 0);
    parts := parts || jsonb_build_object('qty', need, 'unit_cost', coalesce(fallback, 0));
  end if;

  update stock_moves set cost = -total where id = mid;
  perform _stock_bal(_org, _product, _wh, -_qty, -total);
  return parts;
end $$;

-- ---------------------------------------------------------------------
-- Hujjatni o'tkazish
-- ---------------------------------------------------------------------
create or replace function post_stock_doc(_doc uuid)
returns void language plpgsql as $$
declare d stock_docs; l record; parts jsonb; p jsonb; at timestamptz;
begin
  select * into d from stock_docs where id = _doc for update;
  if not found then raise exception 'Hujjat topilmadi'; end if;
  if d.act_id is null and not has_perm(d.org_id, 'warehouse.edit', (select branch_id from warehouses where id = d.warehouse_id)) then
    raise exception 'Ruxsat yo''q';
  end if;
  if d.status <> 'draft' then raise exception 'Hujjat allaqachon o''tkazilgan'; end if;
  if not exists (select 1 from stock_doc_lines where doc_id = _doc) then
    raise exception 'Hujjatda tovar yo''q';
  end if;
  if d.type in ('receipt', 'return') and d.counterparty_id is null then
    raise exception 'Kontragentni tanlang';
  end if;

  at := case when d.doc_date = current_date then now() else d.doc_date::timestamptz + interval '12 hours' end;

  for l in select product_id, sum(qty) qty, max(price) price from stock_doc_lines
            where doc_id = _doc group by product_id
  loop
    if d.type = 'receipt' then
      perform _stock_in(d.org_id, d.id, l.product_id, d.warehouse_id, l.qty, l.price, at);
      update products set last_cost = l.price where id = l.product_id;
    elsif d.type in ('writeoff', 'return') then
      perform _stock_out(d.org_id, d.id, l.product_id, d.warehouse_id, l.qty, at);
    elsif d.type = 'transfer' then
      parts := _stock_out(d.org_id, d.id, l.product_id, d.warehouse_id, l.qty, at);
      for p in select * from jsonb_array_elements(parts) loop
        perform _stock_in(d.org_id, d.id, l.product_id, d.to_warehouse_id,
                                 (p->>'qty')::numeric, (p->>'unit_cost')::numeric, at);
      end loop;
    end if;
  end loop;

  perform set_config('app.posting', 'on', true);
  update stock_docs set status = 'posted', posted_at = now() where id = _doc;
  perform set_config('app.posting', 'off', true);

  insert into audit_log (org_id, entity, entity_id, action, details)
  values (d.org_id, 'stock_doc', d.id, 'post', jsonb_build_object('type', d.type, 'number', d.number));
end $$;

-- ---------------------------------------------------------------------
-- Teskari hujjat (storno): asl hujjat ta'sirini to'liq bekor qiladi.
-- Kirim partiyasi allaqachon sarflangan bo'lsa — rad etiladi.
-- ---------------------------------------------------------------------
create or replace function reverse_stock_doc(_doc uuid)
returns uuid language plpgsql as $$
declare d stock_docs; r stock_docs; m record; ml record; nm bigint;
begin
  select * into d from stock_docs where id = _doc for update;
  if not found then raise exception 'Hujjat topilmadi'; end if;
  if not has_perm(d.org_id, 'warehouse.edit', (select branch_id from warehouses where id = d.warehouse_id)) then raise exception 'Ruxsat yo''q'; end if;
  if d.status <> 'posted' then raise exception 'Faqat o''tkazilgan hujjatni bekor qilish mumkin'; end if;
  if d.reversal_of is not null then raise exception 'Teskari hujjatni qayta bekor qilib bo''lmaydi'; end if;

  if exists (select 1 from stock_lots where doc_id = _doc and qty_left < qty_in) then
    raise exception 'Bu hujjatdagi tovarlar allaqachon ishlatilgan. Bekor qilish o''rniga hisobdan chiqarish yoki qaytarish hujjatini yarating.';
  end if;

  insert into stock_docs (org_id, type, doc_date, warehouse_id, to_warehouse_id, counterparty_id,
                                 reason, note, status, reversal_of, posted_at)
  values (d.org_id, d.type, current_date, d.warehouse_id, d.to_warehouse_id, d.counterparty_id,
          d.reason, 'Storno: ' || d.number, 'draft', d.id, now())
  returning * into r;

  insert into stock_doc_lines (doc_id, product_id, qty, price, position)
  select r.id, product_id, qty, price, position from stock_doc_lines where doc_id = _doc;

  for m in select * from stock_moves where doc_id = _doc loop
    insert into stock_moves (org_id, product_id, warehouse_id, doc_id, qty, cost, moved_at)
    values (m.org_id, m.product_id, m.warehouse_id, r.id, -m.qty, -m.cost, now()) returning id into nm;
    for ml in select * from stock_move_lots where move_id = m.id loop
      -- chiqim bo'lgan bo'lsa partiyaga qaytaramiz; kirim bo'lgan bo'lsa partiyani yopamiz
      update stock_lots set qty_left = qty_left - ml.qty where id = ml.lot_id;
      insert into stock_move_lots (move_id, lot_id, qty, unit_cost) values (nm, ml.lot_id, -ml.qty, ml.unit_cost);
    end loop;
    perform _stock_bal(m.org_id, m.product_id, m.warehouse_id, -m.qty, -m.cost);
  end loop;

  perform set_config('app.posting', 'on', true);
  update stock_docs set status = 'posted' where id = r.id;
  update stock_docs set status = 'reversed' where id = d.id;
  perform set_config('app.posting', 'off', true);

  insert into audit_log (org_id, entity, entity_id, action, details)
  values (d.org_id, 'stock_doc', d.id, 'reverse', jsonb_build_object('reversal', r.id));
  return r.id;
end $$;

-- ---------------------------------------------------------------------
-- Aktni yopish: kalkulyatsiya kartalari bo'yicha avtomatik hisobdan chiqarish.
-- Manfiy qoldiqqa ruxsat bo'lsa, yetishmasa ham yopiladi (UI ogohlantiradi).
-- ---------------------------------------------------------------------
create or replace function close_act(_act uuid)
returns uuid language plpgsql as $$
declare a acts; wh uuid; doc uuid;
begin
  select * into a from acts where id = _act for update;
  if not found then raise exception 'Akt topilmadi'; end if;
  if not has_perm(a.org_id, 'patients.edit', a.branch_id) then raise exception 'Ruxsat yo''q'; end if;
  if a.status <> 'draft' then raise exception 'Akt allaqachon yopilgan'; end if;

  update acts set status = 'closed' where id = _act;

  wh := coalesce(a.warehouse_id, (select id from warehouses where branch_id = a.branch_id and is_main and not archived));
  if wh is null or not exists (
       select 1 from act_items ai join calc_cards cc on cc.price_item_id = ai.price_item_id where ai.act_id = _act) then
    return null;
  end if;

  insert into stock_docs (org_id, type, warehouse_id, reason, note, act_id)
  values (a.org_id, 'writeoff', wh, 'act', 'Akt bo''yicha avtomatik chiqim', _act)
  returning id into doc;

  insert into stock_doc_lines (doc_id, product_id, qty)
  select doc, cc.product_id, sum(cc.qty * ai.qty)
    from act_items ai join calc_cards cc on cc.price_item_id = ai.price_item_id
   where ai.act_id = _act group by cc.product_id;

  perform post_stock_doc(doc);
  return doc;
end $$;

-- Akt bo'yicha yetishmaydigan materiallar (yopishdan oldin ogohlantirish uchun).
create or replace function act_stock_shortage(_act uuid)
returns table (product_id uuid, name text, unit text, need numeric, have numeric)
language sql stable as $$
  with a as (
    select acts.*, coalesce(acts.warehouse_id, (select id from warehouses w where w.branch_id = acts.branch_id and w.is_main)) wh
      from acts where id = _act
  ), need as (
    select cc.product_id, sum(cc.qty * ai.qty) need
      from act_items ai join calc_cards cc on cc.price_item_id = ai.price_item_id
     where ai.act_id = _act group by cc.product_id
  )
  select n.product_id, p.name, p.unit, n.need, coalesce(b.qty, 0)
    from need n join products p on p.id = n.product_id
    cross join a left join stock_balances b on b.product_id = n.product_id and b.warehouse_id = a.wh
   where coalesce(b.qty, 0) < n.need;
$$;

-- ---------------------------------------------------------------------
-- Hisobotlar (barchasi jurnal asosida)
-- ---------------------------------------------------------------------

-- 1. Aylanma: davr boshi, kirim, chiqim, davr oxiri (miqdor va summa).
create or replace function stock_turnover(_org uuid, _wh uuid, _from date, _to date)
returns table (product_id uuid, name text, unit text,
               open_qty numeric, open_value numeric, in_qty numeric, in_value numeric,
               out_qty numeric, out_value numeric, close_qty numeric, close_value numeric)
language sql stable as $$
  select p.id, p.name, p.unit,
    coalesce(sum(m.qty)  filter (where m.moved_at < _from::timestamptz), 0),
    coalesce(sum(m.cost) filter (where m.moved_at < _from::timestamptz), 0),
    coalesce(sum(m.qty)  filter (where m.qty > 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(sum(m.cost) filter (where m.qty > 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(-sum(m.qty)  filter (where m.qty < 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(-sum(m.cost) filter (where m.qty < 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(sum(m.qty)  filter (where m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(sum(m.cost) filter (where m.moved_at < (_to + 1)::timestamptz), 0)
  from products p
  join stock_moves m on m.product_id = p.id and (_wh is null or m.warehouse_id = _wh)
  where p.org_id = _org
  group by p.id, p.name, p.unit
  order by p.name;
$$;

-- 2. Yetkazib beruvchilar qarzi: kirim − qaytarish − to'lovlar.
--    Bekor qilingan hujjatlar status = 'reversed' bo'ladi va hisobga kirmaydi.
create or replace view supplier_debts as
select c.id as counterparty_id, c.org_id, c.name,
  coalesce((select sum(l.qty * l.price) from stock_docs d join stock_doc_lines l on l.doc_id = d.id
             where d.counterparty_id = c.id and d.type = 'receipt' and d.status = 'posted'
               and d.reversal_of is null), 0)
  - coalesce((select sum(-m.cost) from stock_docs d join stock_moves m on m.doc_id = d.id
             where d.counterparty_id = c.id and d.type = 'return' and d.status = 'posted' and d.reversal_of is null), 0)
  as purchased,
  coalesce((select sum(mm.amount) from money_moves mm
             where mm.counterparty_id = c.id and mm.kind = 'expense'), 0) as paid
from counterparties c
where c.type = 'supplier';

-- 3. Kam qolgan tovarlar (buyurtma uchun).
create or replace view low_stock as
select s.org_id, s.product_id, s.warehouse_id, p.name, p.unit, w.name as warehouse_name,
       coalesce(b.qty, 0) as qty, s.min_qty, s.order_qty
  from product_wh_settings s
  join products p on p.id = s.product_id and not p.archived
  join warehouses w on w.id = s.warehouse_id and not w.archived
  left join stock_balances b on b.product_id = s.product_id and b.warehouse_id = s.warehouse_id
 where s.visible and s.min_qty > 0 and coalesce(b.qty, 0) <= s.min_qty;

-- ---------------------------------------------------------------------
-- Yangi filial: 3 ta kassa va asosiy ombor avtomatik yaratiladi.
-- ---------------------------------------------------------------------
create or replace function on_branch_created()
returns trigger language plpgsql as $$
begin
  insert into cashboxes (org_id, branch_id, name, method, position) values
    (new.org_id, new.id, 'Naqd pul', 'cash', 0),
    (new.org_id, new.id, 'Terminal', 'terminal', 1),
    (new.org_id, new.id, 'Click (online)', 'click', 2);
  insert into warehouses (org_id, branch_id, name, is_main) values (new.org_id, new.id, 'Asosiy ombor', true);
  return new;
end $$;
create trigger on_branch_created after insert on branches
  for each row execute function on_branch_created();
