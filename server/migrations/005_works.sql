-- =====================================================================
-- Bajarilgan ish (jadvaldan) va kassadagi shifokor ulushi
-- =====================================================================

-- Kassa → "Bugun — shifokorlar qancha topdi": shifokorga tegadigan ulush, %.
alter table orgs add column if not exists doctor_share_percent numeric(5,2) not null default 30
  check (doctor_share_percent between 0 and 100);

-- Prays kategoriyasi belgisi ("Bajarilgan ish" oynasidagi katta kartochkalar uchun).
alter table price_categories add column if not exists icon text not null default 'tooth'
  check (icon in ('cons', 'tooth', 'hyg', 'crown', 'braces', 'surg'));
update price_categories set icon = case
  when name ilike '%konsult%' or name ilike '%ko‘rik%' or name ilike '%korik%' then 'cons'
  when name ilike '%gigiyen%' then 'hyg'
  when name ilike '%ortoped%' then 'crown'
  when name ilike '%ortodon%' then 'braces'
  when name ilike '%xirurg%' or name ilike '%implant%' then 'surg'
  else 'tooth' end;
