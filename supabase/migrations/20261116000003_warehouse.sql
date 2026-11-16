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

create table public.warehouses (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  name           text not null,
  responsible_id uuid references auth.users(id),
  is_main        boolean not null default false,
  note           text,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);
-- Klinikada faqat bitta asosiy ombor.
create unique index warehouses_one_main on public.warehouses (clinic_id) where is_main;

alter table public.acts add constraint acts_warehouse_fk
  foreign key (warehouse_id) references public.warehouses(id) on delete set null;

create table public.product_categories (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  parent_id uuid references public.product_categories(id) on delete cascade,
  name      text not null,
  position  int  not null default 0
);

create table public.brands (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name      text not null,
  logo_url  text,
  archived  boolean not null default false
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  brand_id    uuid references public.brands(id) on delete set null,
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
create index on public.products (clinic_id, name);

-- Har bir ombor uchun: ko'rinish, kritik qoldiq, buyurtma miqdori, joylashuv.
create table public.product_wh_settings (
  product_id   uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  visible      boolean not null default true,
  min_qty      numeric(14,3) not null default 0,
  order_qty    numeric(14,3) not null default 0,
  location     text,                    -- "1-tortma", "A javon", "Seyf" ...
  primary key (product_id, warehouse_id)
);

create table public.stock_docs (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  type            text not null check (type in ('receipt', 'writeoff', 'transfer', 'return')),
  number          text not null,
  doc_date        date not null default current_date,
  warehouse_id    uuid not null references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  counterparty_id uuid references public.counterparties(id),
  responsible_id  uuid references auth.users(id),
  reason          text,               -- hisobdan chiqarish sababi: usage, broken, expired, act, other
  note            text,
  status          text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  reversal_of     uuid references public.stock_docs(id),
  act_id          uuid references public.acts(id) on delete set null,
  posted_at       timestamptz,
  created_by      uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (clinic_id, number),
  check (type <> 'transfer' or (to_warehouse_id is not null and to_warehouse_id <> warehouse_id))
);
create index on public.stock_docs (clinic_id, type, doc_date desc);

alter table public.money_moves add constraint money_moves_stock_doc_fk
  foreign key (stock_doc_id) references public.stock_docs(id) on delete set null;

create table public.stock_doc_lines (
  id         uuid primary key default gen_random_uuid(),
  doc_id     uuid not null references public.stock_docs(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty        numeric(14,3) not null check (qty > 0),     -- eng kichik birlikda
  price      numeric(16,4) not null default 0 check (price >= 0), -- 1 birlik narxi (kirim)
  position   int not null default 0
);

create table public.stock_lots (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  doc_id       uuid not null references public.stock_docs(id),
  qty_in       numeric(14,3) not null check (qty_in > 0),
  qty_left     numeric(14,3) not null check (qty_left >= 0),
  unit_cost    numeric(16,4) not null,
  received_at  timestamptz not null default now(),
  seq          bigint generated always as identity   -- bir vaqtda kelgan partiyalar tartibi
);
create index on public.stock_lots (product_id, warehouse_id, received_at, seq) where qty_left > 0;

create table public.stock_moves (
  id           bigint generated always as identity primary key,
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  doc_id       uuid not null references public.stock_docs(id),
  qty          numeric(14,3) not null,      -- + kirim, - chiqim
  cost         numeric(18,4) not null,      -- harakat tannarxi (ishorasi qty bilan bir xil)
  moved_at     timestamptz not null default now()
);
create index on public.stock_moves (product_id, warehouse_id, moved_at);
create index on public.stock_moves (doc_id);

create table public.stock_move_lots (
  move_id   bigint not null references public.stock_moves(id) on delete cascade,
  lot_id    uuid   not null references public.stock_lots(id),
  qty       numeric(14,3) not null,
  unit_cost numeric(16,4) not null
);

create table public.stock_balances (
  product_id   uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  qty          numeric(14,3) not null default 0,
  value        numeric(18,4) not null default 0,
  primary key (product_id, warehouse_id)
);

-- Kalkulyatsiya kartasi: xizmat bajarilganda qaysi material qancha chiqadi.
create table public.calc_cards (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  price_item_id uuid not null references public.price_items(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  qty           numeric(14,3) not null check (qty > 0),
  unique (price_item_id, product_id)
);

-- ---------------------------------------------------------------------
-- Hujjat raqami: YYMM-0000000271 (klinika ichida ketma-ket).
-- ---------------------------------------------------------------------
create or replace function public.next_stock_doc_number(_clinic uuid, _date date)
returns text language plpgsql set search_path = public as $$
declare n bigint;
begin
  perform pg_advisory_xact_lock(hashtext('stockdoc:' || _clinic::text));
  select coalesce(max(split_part(number, '-', 2)::bigint), 0) + 1 into n
    from public.stock_docs where clinic_id = _clinic and number ~ '^\d{4}-\d+$';
  return to_char(_date, 'YYMM') || '-' || lpad(n::text, 10, '0');
end $$;

create or replace function public.stock_docs_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.number is null or new.number = '' then
    new.number := public.next_stock_doc_number(new.clinic_id, new.doc_date);
  end if;
  if new.responsible_id is null then new.responsible_id := auth.uid(); end if;
  return new;
end $$;
create trigger stock_docs_defaults before insert on public.stock_docs
  for each row execute function public.stock_docs_defaults();

-- O'tkazilgan hujjatni tahrirlash/o'chirishni taqiqlash.
create or replace function public.stock_docs_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'O''tkazilgan hujjatni o''chirib bo''lmaydi. Teskari hujjat yarating.'; end if;
    return old;
  end if;
  if old.status <> 'draft' and current_setting('tishduxtir.posting', true) is distinct from 'on' then
    raise exception 'O''tkazilgan hujjatni tahrirlab bo''lmaydi.';
  end if;
  return new;
end $$;
create trigger stock_docs_guard before update or delete on public.stock_docs
  for each row execute function public.stock_docs_guard();

create or replace function public.stock_lines_guard()
returns trigger language plpgsql set search_path = public as $$
declare s text;
begin
  select status into s from public.stock_docs where id = coalesce(new.doc_id, old.doc_id);
  if s is distinct from 'draft' then raise exception 'O''tkazilgan hujjat qatorlarini o''zgartirib bo''lmaydi.'; end if;
  return coalesce(new, old);
end $$;
create trigger stock_lines_guard before insert or update or delete on public.stock_doc_lines
  for each row execute function public.stock_lines_guard();

-- ---------------------------------------------------------------------
-- Ichki yordamchilar
-- ---------------------------------------------------------------------
create or replace function public._stock_bal(_clinic uuid, _product uuid, _wh uuid, _qty numeric, _cost numeric)
returns void language sql set search_path = public as $$
  insert into public.stock_balances (product_id, warehouse_id, clinic_id, qty, value)
  values (_product, _wh, _clinic, _qty, _cost)
  on conflict (product_id, warehouse_id)
  do update set qty = stock_balances.qty + excluded.qty, value = stock_balances.value + excluded.value;
$$;

-- Kirim: yangi partiya + musbat harakat.
create or replace function public._stock_in(_clinic uuid, _doc uuid, _product uuid, _wh uuid, _qty numeric, _unit_cost numeric, _at timestamptz)
returns void language plpgsql set search_path = public as $$
declare mid bigint; lid uuid;
begin
  insert into public.stock_lots (clinic_id, product_id, warehouse_id, doc_id, qty_in, qty_left, unit_cost, received_at)
  values (_clinic, _product, _wh, _doc, _qty, _qty, _unit_cost, _at) returning id into lid;
  insert into public.stock_moves (clinic_id, product_id, warehouse_id, doc_id, qty, cost, moved_at)
  values (_clinic, _product, _wh, _doc, _qty, _qty * _unit_cost, _at) returning id into mid;
  insert into public.stock_move_lots (move_id, lot_id, qty, unit_cost) values (mid, lid, _qty, _unit_cost);
  perform public._stock_bal(_clinic, _product, _wh, _qty, _qty * _unit_cost);
end $$;

-- Chiqim (FIFO). Yetmasa va manfiy qoldiqqa ruxsat bo'lsa, qolgani oxirgi narxda yoziladi.
-- Qaytaradi: [{qty, unit_cost}] — ko'chirishda qabul omboriga xuddi shu narxlarda partiya ochish uchun.
create or replace function public._stock_out(_clinic uuid, _doc uuid, _product uuid, _wh uuid, _qty numeric, _at timestamptz)
returns jsonb language plpgsql set search_path = public as $$
declare
  need numeric := _qty; take numeric; total numeric := 0; mid bigint;
  lot record; parts jsonb := '[]'::jsonb; allow boolean; fallback numeric;
begin
  insert into public.stock_moves (clinic_id, product_id, warehouse_id, doc_id, qty, cost, moved_at)
  values (_clinic, _product, _wh, _doc, -_qty, 0, _at) returning id into mid;

  for lot in
    select id, qty_left, unit_cost from public.stock_lots
     where product_id = _product and warehouse_id = _wh and qty_left > 0
     order by received_at, seq for update
  loop
    exit when need <= 0;
    take := least(need, lot.qty_left);
    update public.stock_lots set qty_left = qty_left - take where id = lot.id;
    insert into public.stock_move_lots (move_id, lot_id, qty, unit_cost) values (mid, lot.id, -take, lot.unit_cost);
    total := total + take * lot.unit_cost;
    parts := parts || jsonb_build_object('qty', take, 'unit_cost', lot.unit_cost);
    need := need - take;
  end loop;

  if need > 0 then
    select allow_negative_stock into allow from public.clinics where id = _clinic;
    if not allow then
      raise exception 'Omborda yetarli qoldiq yo''q: % (yetishmaydi: %)',
        (select name from public.products where id = _product), need;
    end if;
    select last_cost into fallback from public.products where id = _product;
    total := total + need * coalesce(fallback, 0);
    parts := parts || jsonb_build_object('qty', need, 'unit_cost', coalesce(fallback, 0));
  end if;

  update public.stock_moves set cost = -total where id = mid;
  perform public._stock_bal(_clinic, _product, _wh, -_qty, -total);
  return parts;
end $$;

-- ---------------------------------------------------------------------
-- Hujjatni o'tkazish
-- ---------------------------------------------------------------------
create or replace function public.post_stock_doc(_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.stock_docs; l record; parts jsonb; p jsonb; at timestamptz;
begin
  select * into d from public.stock_docs where id = _doc for update;
  if not found then raise exception 'Hujjat topilmadi'; end if;
  if not public.has_perm(d.clinic_id, 'warehouse.edit') and d.act_id is null then
    raise exception 'Ruxsat yo''q';
  end if;
  if d.status <> 'draft' then raise exception 'Hujjat allaqachon o''tkazilgan'; end if;
  if not exists (select 1 from public.stock_doc_lines where doc_id = _doc) then
    raise exception 'Hujjatda tovar yo''q';
  end if;
  if d.type in ('receipt', 'return') and d.counterparty_id is null then
    raise exception 'Kontragentni tanlang';
  end if;

  at := case when d.doc_date = current_date then now() else d.doc_date::timestamptz + interval '12 hours' end;

  for l in select product_id, sum(qty) qty, max(price) price from public.stock_doc_lines
            where doc_id = _doc group by product_id
  loop
    if d.type = 'receipt' then
      perform public._stock_in(d.clinic_id, d.id, l.product_id, d.warehouse_id, l.qty, l.price, at);
      update public.products set last_cost = l.price where id = l.product_id;
    elsif d.type in ('writeoff', 'return') then
      perform public._stock_out(d.clinic_id, d.id, l.product_id, d.warehouse_id, l.qty, at);
    elsif d.type = 'transfer' then
      parts := public._stock_out(d.clinic_id, d.id, l.product_id, d.warehouse_id, l.qty, at);
      for p in select * from jsonb_array_elements(parts) loop
        perform public._stock_in(d.clinic_id, d.id, l.product_id, d.to_warehouse_id,
                                 (p->>'qty')::numeric, (p->>'unit_cost')::numeric, at);
      end loop;
    end if;
  end loop;

  perform set_config('tishduxtir.posting', 'on', true);
  update public.stock_docs set status = 'posted', posted_at = now() where id = _doc;
  perform set_config('tishduxtir.posting', 'off', true);

  insert into public.audit_log (clinic_id, entity, entity_id, action, details)
  values (d.clinic_id, 'stock_doc', d.id, 'post', jsonb_build_object('type', d.type, 'number', d.number));
end $$;

-- ---------------------------------------------------------------------
-- Teskari hujjat (storno): asl hujjat ta'sirini to'liq bekor qiladi.
-- Kirim partiyasi allaqachon sarflangan bo'lsa — rad etiladi.
-- ---------------------------------------------------------------------
create or replace function public.reverse_stock_doc(_doc uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.stock_docs; r public.stock_docs; m record; ml record; nm bigint;
begin
  select * into d from public.stock_docs where id = _doc for update;
  if not found then raise exception 'Hujjat topilmadi'; end if;
  if not public.has_perm(d.clinic_id, 'warehouse.edit') then raise exception 'Ruxsat yo''q'; end if;
  if d.status <> 'posted' then raise exception 'Faqat o''tkazilgan hujjatni bekor qilish mumkin'; end if;
  if d.reversal_of is not null then raise exception 'Teskari hujjatni qayta bekor qilib bo''lmaydi'; end if;

  if exists (select 1 from public.stock_lots where doc_id = _doc and qty_left < qty_in) then
    raise exception 'Bu hujjatdagi tovarlar allaqachon ishlatilgan. Bekor qilish o''rniga hisobdan chiqarish yoki qaytarish hujjatini yarating.';
  end if;

  insert into public.stock_docs (clinic_id, type, doc_date, warehouse_id, to_warehouse_id, counterparty_id,
                                 reason, note, status, reversal_of, posted_at)
  values (d.clinic_id, d.type, current_date, d.warehouse_id, d.to_warehouse_id, d.counterparty_id,
          d.reason, 'Storno: ' || d.number, 'draft', d.id, now())
  returning * into r;

  insert into public.stock_doc_lines (doc_id, product_id, qty, price, position)
  select r.id, product_id, qty, price, position from public.stock_doc_lines where doc_id = _doc;

  for m in select * from public.stock_moves where doc_id = _doc loop
    insert into public.stock_moves (clinic_id, product_id, warehouse_id, doc_id, qty, cost, moved_at)
    values (m.clinic_id, m.product_id, m.warehouse_id, r.id, -m.qty, -m.cost, now()) returning id into nm;
    for ml in select * from public.stock_move_lots where move_id = m.id loop
      -- chiqim bo'lgan bo'lsa partiyaga qaytaramiz; kirim bo'lgan bo'lsa partiyani yopamiz
      update public.stock_lots set qty_left = qty_left - ml.qty where id = ml.lot_id;
      insert into public.stock_move_lots (move_id, lot_id, qty, unit_cost) values (nm, ml.lot_id, -ml.qty, ml.unit_cost);
    end loop;
    perform public._stock_bal(m.clinic_id, m.product_id, m.warehouse_id, -m.qty, -m.cost);
  end loop;

  perform set_config('tishduxtir.posting', 'on', true);
  update public.stock_docs set status = 'posted' where id = r.id;
  update public.stock_docs set status = 'reversed' where id = d.id;
  perform set_config('tishduxtir.posting', 'off', true);

  insert into public.audit_log (clinic_id, entity, entity_id, action, details)
  values (d.clinic_id, 'stock_doc', d.id, 'reverse', jsonb_build_object('reversal', r.id));
  return r.id;
end $$;

-- ---------------------------------------------------------------------
-- Aktni yopish: kalkulyatsiya kartalari bo'yicha avtomatik hisobdan chiqarish.
-- Manfiy qoldiqqa ruxsat bo'lsa, yetishmasa ham yopiladi (UI ogohlantiradi).
-- ---------------------------------------------------------------------
create or replace function public.close_act(_act uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.acts; wh uuid; doc uuid;
begin
  select * into a from public.acts where id = _act for update;
  if not found then raise exception 'Akt topilmadi'; end if;
  if not public.has_perm(a.clinic_id, 'patients.edit') then raise exception 'Ruxsat yo''q'; end if;
  if a.status <> 'draft' then raise exception 'Akt allaqachon yopilgan'; end if;

  update public.acts set status = 'closed' where id = _act;

  wh := coalesce(a.warehouse_id, (select id from public.warehouses where clinic_id = a.clinic_id and is_main and not archived));
  if wh is null or not exists (
       select 1 from public.act_items ai join public.calc_cards cc on cc.price_item_id = ai.price_item_id where ai.act_id = _act) then
    return null;
  end if;

  insert into public.stock_docs (clinic_id, type, warehouse_id, reason, note, act_id)
  values (a.clinic_id, 'writeoff', wh, 'act', 'Akt bo''yicha avtomatik chiqim', _act)
  returning id into doc;

  insert into public.stock_doc_lines (doc_id, product_id, qty)
  select doc, cc.product_id, sum(cc.qty * ai.qty)
    from public.act_items ai join public.calc_cards cc on cc.price_item_id = ai.price_item_id
   where ai.act_id = _act group by cc.product_id;

  perform public.post_stock_doc(doc);
  return doc;
end $$;

-- Akt bo'yicha yetishmaydigan materiallar (yopishdan oldin ogohlantirish uchun).
create or replace function public.act_stock_shortage(_act uuid)
returns table (product_id uuid, name text, unit text, need numeric, have numeric)
language sql stable security invoker set search_path = public as $$
  with a as (
    select acts.*, coalesce(acts.warehouse_id, (select id from public.warehouses w where w.clinic_id = acts.clinic_id and w.is_main)) wh
      from public.acts where id = _act
  ), need as (
    select cc.product_id, sum(cc.qty * ai.qty) need
      from public.act_items ai join public.calc_cards cc on cc.price_item_id = ai.price_item_id
     where ai.act_id = _act group by cc.product_id
  )
  select n.product_id, p.name, p.unit, n.need, coalesce(b.qty, 0)
    from need n join public.products p on p.id = n.product_id
    cross join a left join public.stock_balances b on b.product_id = n.product_id and b.warehouse_id = a.wh
   where coalesce(b.qty, 0) < n.need;
$$;

-- ---------------------------------------------------------------------
-- Hisobotlar (barchasi jurnal asosida)
-- ---------------------------------------------------------------------

-- 1. Aylanma: davr boshi, kirim, chiqim, davr oxiri (miqdor va summa).
create or replace function public.stock_turnover(_clinic uuid, _wh uuid, _from date, _to date)
returns table (product_id uuid, name text, unit text,
               open_qty numeric, open_value numeric, in_qty numeric, in_value numeric,
               out_qty numeric, out_value numeric, close_qty numeric, close_value numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.unit,
    coalesce(sum(m.qty)  filter (where m.moved_at < _from::timestamptz), 0),
    coalesce(sum(m.cost) filter (where m.moved_at < _from::timestamptz), 0),
    coalesce(sum(m.qty)  filter (where m.qty > 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(sum(m.cost) filter (where m.qty > 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(-sum(m.qty)  filter (where m.qty < 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(-sum(m.cost) filter (where m.qty < 0 and m.moved_at >= _from::timestamptz and m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(sum(m.qty)  filter (where m.moved_at < (_to + 1)::timestamptz), 0),
    coalesce(sum(m.cost) filter (where m.moved_at < (_to + 1)::timestamptz), 0)
  from public.products p
  join public.stock_moves m on m.product_id = p.id and (_wh is null or m.warehouse_id = _wh)
  where p.clinic_id = _clinic
  group by p.id, p.name, p.unit
  order by p.name;
$$;

-- 2. Yetkazib beruvchilar qarzi: kirim − qaytarish − to'lovlar.
--    Bekor qilingan hujjatlar status = 'reversed' bo'ladi va hisobga kirmaydi.
create or replace view public.supplier_debts with (security_invoker = true) as
select c.id as counterparty_id, c.clinic_id, c.name,
  coalesce((select sum(l.qty * l.price) from public.stock_docs d join public.stock_doc_lines l on l.doc_id = d.id
             where d.counterparty_id = c.id and d.type = 'receipt' and d.status = 'posted'
               and d.reversal_of is null), 0)
  - coalesce((select sum(-m.cost) from public.stock_docs d join public.stock_moves m on m.doc_id = d.id
             where d.counterparty_id = c.id and d.type = 'return' and d.status = 'posted' and d.reversal_of is null), 0)
  as purchased,
  coalesce((select sum(mm.amount) from public.money_moves mm
             where mm.counterparty_id = c.id and mm.kind = 'expense'), 0) as paid
from public.counterparties c
where c.type = 'supplier';

-- 3. Kam qolgan tovarlar (buyurtma uchun).
create or replace view public.low_stock with (security_invoker = true) as
select s.clinic_id, s.product_id, s.warehouse_id, p.name, p.unit, w.name as warehouse_name,
       coalesce(b.qty, 0) as qty, s.min_qty, s.order_qty
  from public.product_wh_settings s
  join public.products p on p.id = s.product_id and not p.archived
  join public.warehouses w on w.id = s.warehouse_id and not w.archived
  left join public.stock_balances b on b.product_id = s.product_id and b.warehouse_id = s.warehouse_id
 where s.visible and s.min_qty > 0 and coalesce(b.qty, 0) <= s.min_qty;
