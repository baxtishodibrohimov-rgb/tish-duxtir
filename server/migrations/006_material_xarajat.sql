-- =====================================================================
-- Material xarajat: tish formulasi, ish materiallarining guruhlari, tovar rasmi
-- =====================================================================

-- Kategoriya tanlanganda tish formulasi so'ralsinmi (Konsultatsiyada odatda yo'q).
alter table price_categories add column if not exists ask_teeth boolean not null default true;
update price_categories set ask_teeth = false where icon = 'cons';

-- Ish materiallarining guruhlari (masalan "Anesteziya", "Izolyatsiya"): shifokor ularni birin-ketin ko'radi.
create table if not exists work_mat_groups (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  price_item_id uuid not null references price_items(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  position      int not null default 0
);
create index if not exists work_mat_groups_item on work_mat_groups (price_item_id, position);

-- Kalkulyatsiya kartasi qatori — guruh va tartib.
alter table calc_cards add column if not exists group_id uuid references work_mat_groups(id) on delete set null;
alter table calc_cards add column if not exists position int not null default 0;

-- Tovar rasmi (fayllar papkasidagi nisbiy yo'l).
alter table products add column if not exists image_path text;
alter table products add column if not exists image_mime text;
