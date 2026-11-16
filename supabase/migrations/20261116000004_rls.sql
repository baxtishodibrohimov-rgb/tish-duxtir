-- =====================================================================
-- Ruxsatlar (RLS). Har bir jadval: o'qish va yozish uchun alohida ruxsat.
-- Ruxsat nomlari: schedule.*, patients.*, cashbox.*, warehouse.*, reports.view,
-- settings.edit, staff.manage. Egasi hamma narsaga ruxsatga ega.
-- =====================================================================

create trigger on_clinic_created after insert on public.clinics
  for each row execute function public.on_clinic_created();

-- ---------- profiles ----------
alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- clinics ----------
alter table public.clinics enable row level security;
create policy clinics_select on public.clinics for select using (owner_id = auth.uid() or public.is_member(id));
create policy clinics_insert on public.clinics for insert with check (owner_id = auth.uid());
create policy clinics_update on public.clinics for update using (public.has_perm(id, 'settings.edit'));
-- access_until faqat server tomonidan o'zgartiriladi
revoke update (access_until, owner_id) on public.clinics from authenticated;

-- ---------- clinic_members ----------
alter table public.clinic_members enable row level security;
create policy members_select on public.clinic_members for select using (user_id = auth.uid() or public.is_member(clinic_id));
create policy members_write on public.clinic_members for all
  using (public.has_perm(clinic_id, 'staff.manage') and role <> 'owner')
  with check (public.has_perm(clinic_id, 'staff.manage') and role <> 'owner');

-- ---------- clinic_id ustuni bor jadvallar uchun umumiy siyosatlar ----------
do $$
declare r record;
begin
  for r in select * from (values
    -- jadval,              o'qish ruxsati,      yozish ruxsati
    ('rooms',               null,                'settings.edit'),
    ('patient_statuses',    null,                'settings.edit'),
    ('price_categories',    null,                'settings.edit'),
    ('price_items',         null,                'settings.edit'),
    ('patients',            'patients.view',     'patients.edit'),
    ('treatment_plans',     'patients.view',     'patients.edit'),
    ('treatment_records',   'patients.view',     'patients.edit'),
    ('record_files',        'patients.view',     'patients.edit'),
    ('acts',                'patients.view',     'patients.edit'),
    ('reminders',           'patients.view',     'patients.edit'),
    ('visits',              'schedule.view',     'schedule.edit'),
    ('time_reservations',   'schedule.view',     'schedule.edit'),
    ('staff_shifts',        'schedule.view',     'schedule.edit'),
    ('cashboxes',           null,                'cashbox.edit'),
    ('expense_categories',  null,                'cashbox.edit'),
    ('currency_rates',      null,                'cashbox.edit'),
    ('counterparties',      null,                'cashbox.edit'),
    ('money_moves',         'cashbox.view',      'cashbox.edit'),
    ('warehouses',          null,                'warehouse.admin'),
    ('product_categories',  'warehouse.view',    'warehouse.admin'),
    ('brands',              'warehouse.view',    'warehouse.admin'),
    ('products',            'warehouse.view',    'warehouse.admin'),
    ('product_wh_settings', 'warehouse.view',    'warehouse.admin'),
    ('calc_cards',          'warehouse.view',    'warehouse.admin'),
    ('stock_docs',          'warehouse.view',    'warehouse.edit'),
    ('stock_lots',          'warehouse.view',    null),
    ('stock_moves',         'warehouse.view',    null),
    ('stock_balances',      'warehouse.view',    null),
    ('audit_log',           'staff.manage',      null)
  ) as t(tbl, rperm, wperm)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('create policy %I on public.%I for select using (%s)',
      r.tbl || '_select', r.tbl,
      case when r.rperm is null then 'public.is_member(clinic_id)'
           else format('public.has_perm(clinic_id, %L)', r.rperm) end);
    if r.wperm is not null then
      execute format('create policy %I on public.%I for insert with check (public.has_perm(clinic_id, %L))', r.tbl || '_insert', r.tbl, r.wperm);
      execute format('create policy %I on public.%I for update using (public.has_perm(clinic_id, %L)) with check (public.has_perm(clinic_id, %L))', r.tbl || '_update', r.tbl, r.wperm, r.wperm);
      execute format('create policy %I on public.%I for delete using (public.has_perm(clinic_id, %L))', r.tbl || '_delete', r.tbl, r.wperm);
    end if;
  end loop;
end $$;

-- Ombor kontragentlarini omborchi ham qo'sha oladi (faqat yetkazib beruvchi).
create policy counterparties_wh_insert on public.counterparties for insert
  with check (type = 'supplier' and public.has_perm(clinic_id, 'warehouse.admin'));
create policy counterparties_wh_update on public.counterparties for update
  using (type = 'supplier' and public.has_perm(clinic_id, 'warehouse.admin'))
  with check (type = 'supplier' and public.has_perm(clinic_id, 'warehouse.admin'));

-- ---------- clinic_id ustuni yo'q bola jadvallar ----------
alter table public.treatment_plan_items enable row level security;
create policy tpi_select on public.treatment_plan_items for select using (exists (
  select 1 from public.treatment_plans p where p.id = plan_id and public.has_perm(p.clinic_id, 'patients.view')));
create policy tpi_write on public.treatment_plan_items for all using (exists (
  select 1 from public.treatment_plans p where p.id = plan_id and public.has_perm(p.clinic_id, 'patients.edit')))
  with check (exists (select 1 from public.treatment_plans p where p.id = plan_id and public.has_perm(p.clinic_id, 'patients.edit')));

alter table public.act_items enable row level security;
create policy act_items_select on public.act_items for select using (exists (
  select 1 from public.acts a where a.id = act_id and public.has_perm(a.clinic_id, 'patients.view')));
create policy act_items_write on public.act_items for all using (exists (
  select 1 from public.acts a where a.id = act_id and a.status = 'draft' and public.has_perm(a.clinic_id, 'patients.edit')))
  with check (exists (select 1 from public.acts a where a.id = act_id and a.status = 'draft' and public.has_perm(a.clinic_id, 'patients.edit')));

alter table public.stock_doc_lines enable row level security;
create policy sdl_select on public.stock_doc_lines for select using (exists (
  select 1 from public.stock_docs d where d.id = doc_id and public.has_perm(d.clinic_id, 'warehouse.view')));
create policy sdl_write on public.stock_doc_lines for all using (exists (
  select 1 from public.stock_docs d where d.id = doc_id and public.has_perm(d.clinic_id, 'warehouse.edit')))
  with check (exists (select 1 from public.stock_docs d where d.id = doc_id and public.has_perm(d.clinic_id, 'warehouse.edit')));

alter table public.stock_move_lots enable row level security;
create policy sml_select on public.stock_move_lots for select using (exists (
  select 1 from public.stock_moves m where m.id = move_id and public.has_perm(m.clinic_id, 'warehouse.view')));

-- Ichki funksiyalarni tashqaridan chaqirib bo'lmasin.
revoke execute on function public._stock_in(uuid, uuid, uuid, uuid, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke execute on function public._stock_out(uuid, uuid, uuid, uuid, numeric, timestamptz) from public, anon, authenticated;
revoke execute on function public._stock_bal(uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;

-- ---------- Fayllar (rentgen, rasm, ovozli izoh) ----------
insert into storage.buckets (id, name, public) values ('treatment-files', 'treatment-files', false)
on conflict (id) do nothing;

create policy tf_select on storage.objects for select using (
  bucket_id = 'treatment-files' and public.has_perm(((storage.foldername(name))[1])::uuid, 'patients.view'));
create policy tf_insert on storage.objects for insert with check (
  bucket_id = 'treatment-files' and public.has_perm(((storage.foldername(name))[1])::uuid, 'patients.edit'));
create policy tf_delete on storage.objects for delete using (
  bucket_id = 'treatment-files' and public.has_perm(((storage.foldername(name))[1])::uuid, 'patients.edit'));
