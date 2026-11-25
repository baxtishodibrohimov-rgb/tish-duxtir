-- =====================================================================
-- "Material xarajat" tarixda to'liq ko'rinsin: kategoriya, ish, narx, guruhlar bo'yicha materiallar
-- =====================================================================
alter table treatment_records add column if not exists details jsonb;
