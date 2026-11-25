-- =====================================================================
-- Eski to'lovlarni shifokorga bog'lash ("Shifokor ko'rsatilmagan" qatori uchun)
-- Faqat shifokori bo'sh bo'lgan bemor to'lovlari/qaytarishlari to'ldiriladi, boshqa yozuvlarga tegilmaydi.
-- Tartib: 1) to'lov bog'langan akt shifokori; 2) o'sha kuni bemorning qabuli shifokori (vaqti eng yaqini);
--         3) to'lov kunigacha bo'lgan oxirgi yopilgan akt shifokori.
-- =====================================================================
update money_moves m set doctor_id = coalesce(
  (select a.doctor_id from acts a where a.id = m.act_id),
  (select v.doctor_id from visits v
    where v.patient_id = m.patient_id and v.doctor_id is not null
      and (v.starts_at at time zone 'Asia/Tashkent')::date = (m.moved_at at time zone 'Asia/Tashkent')::date
    order by abs(extract(epoch from v.starts_at - m.moved_at)) limit 1),
  (select a.doctor_id from acts a
    where a.patient_id = m.patient_id and a.status = 'closed' and a.doctor_id is not null
      and a.act_date <= (m.moved_at at time zone 'Asia/Tashkent')::date
    order by a.act_date desc, a.created_at desc limit 1)
)
where m.doctor_id is null and m.kind in ('income', 'refund') and m.patient_id is not null;
