-- =====================================================================
-- Kontragent turlari: majburiy (supplier, doctor, assistant, technician) + klinika o'zi kiritadigan turlar.
--   O'z turi: counterparties.type = 'other' va type_id → counterparty_types.
--   Avvalgi "Boshqa" va "Laboratoriya" turidagilar shu nomli o'z turlariga o'tkaziladi.
-- =====================================================================
create table if not exists counterparty_types (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists counterparty_types_name on counterparty_types (org_id, lower(btrim(name)));

alter table counterparties add column if not exists type_id uuid references counterparty_types(id) on delete restrict;

insert into counterparty_types (org_id, name, position)
select distinct c.org_id, case c.type when 'lab' then 'Laboratoriya' else 'Boshqa' end, case c.type when 'lab' then 1 else 2 end
  from counterparties c where c.type in ('lab', 'other') and c.type_id is null
on conflict do nothing;

update counterparties c set type_id = t.id, type = 'other'
  from counterparty_types t
 where c.type in ('lab', 'other') and c.type_id is null and t.org_id = c.org_id
   and lower(t.name) = case c.type when 'lab' then 'laboratoriya' else 'boshqa' end;

alter table counterparties drop constraint if exists counterparties_type_check;
alter table counterparties alter column type drop default;
alter table counterparties add constraint counterparties_type_check
  check ((type in ('supplier', 'doctor', 'assistant', 'technician') and type_id is null) or (type = 'other' and type_id is not null));
