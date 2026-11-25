-- =====================================================================
-- Davolash tarixi: har bir bosqich — karta; ichida izohlar, rasmlar, stikerlar
-- =====================================================================

-- Kartaning sarlavhasi (masalan "Kanal davolash") va u qaysi aktdan yaratilgani.
alter table treatment_records add column if not exists title text;
alter table treatment_records add column if not exists act_id uuid references acts(id) on delete set null;
-- Kim yozgani (server yangi yozuvga avtomatik qo'yadi; avval bu ustun yo'qligi sabab qo'lda yozuv qo'shib bo'lmasdi).
alter table treatment_records add column if not exists created_by uuid references users(id) on delete set null;
create unique index if not exists treatment_records_act on treatment_records (act_id) where act_id is not null;
create index if not exists treatment_records_patient on treatment_records (patient_id, created_at desc);

-- Karta ichidagi izohlar: muallif, matn va/yoki stiker; rasmlar record_files.comment_id orqali.
create table if not exists record_comments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  record_id  uuid not null references treatment_records(id) on delete cascade,
  author_id  uuid references users(id) on delete set null,
  text       text,
  sticker    text,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists record_comments_record on record_comments (record_id, created_at);

alter table record_files add column if not exists comment_id uuid references record_comments(id) on delete cascade;

-- Akt yopilganda bemor tarixida karta paydo bo'ladi (muallif — aktdagi shifokor).
create or replace function act_to_history() returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    insert into treatment_records (org_id, branch_id, patient_id, visit_id, doctor_id, title, tooth, act_id)
    select new.org_id, new.branch_id, new.patient_id, new.visit_id, new.doctor_id,
           coalesce((select string_agg(name, ', ' order by id) from act_items where act_id = new.id), 'Bajarilgan ish'),
           (select string_agg(distinct tooth, ', ') from act_items where act_id = new.id and tooth is not null),
           new.id
    on conflict (act_id) where act_id is not null do nothing;
  end if;
  return new;
end $$;
drop trigger if exists acts_history on acts;
create trigger acts_history after update of status on acts for each row execute function act_to_history();

-- Avval yopilgan aktlar uchun ham kartalar.
insert into treatment_records (org_id, branch_id, patient_id, visit_id, doctor_id, title, tooth, act_id, created_at)
select a.org_id, a.branch_id, a.patient_id, a.visit_id, a.doctor_id,
       coalesce((select string_agg(name, ', ' order by id) from act_items where act_id = a.id), 'Bajarilgan ish'),
       (select string_agg(distinct tooth, ', ') from act_items where act_id = a.id and tooth is not null),
       a.id, a.created_at
  from acts a
 where a.status = 'closed' and not exists (select 1 from treatment_records r where r.act_id = a.id);
