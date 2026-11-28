-- =====================================================================
-- Shifokor ulushi kassaga tushgan har bir to'lovdan (praysdagi ulushga proporsional).
--   Ish 350 000, shifokorga 120 000, bemor 200 000 to'ladi → 200 000 × 120/350 = 68 571.
--   To'lov qaysi ishga: avval to'lovda ko'rsatilgan aktga, so'ng bemorning eng eski to'lanmagan aktlariga.
--   Hech qaysi ishga to'g'ri kelmasa (avans, ish yozilmagan) — umumiy foiz (orgs.doctor_share_percent).
--   Avans keyin ishga ketsa — qayta hisoblanmaydi (shifokor ulushini to'lov kunida olgan).
--   Qaytarish (refund) — teskari: avval shu aktdan, so'ng avansdan, so'ng oxirgi to'langan aktlardan.
-- =====================================================================
create or replace function payment_doctor_shares(_org uuid, _branch uuid, _from date, _to date)
returns table (o_move uuid, o_share bigint, o_base text, o_works text)
language plpgsql stable as $$
#variable_conflict use_column
declare
  pid uuid; ev record; def numeric; t0 timestamptz; t1 timestamptz;
  ids uuid[]; rem numeric[]; tot numeric[]; doc numeric[]; nms text[];
  credit numeric; amt numeric; take numeric; sh numeric; i int; n int; used_def boolean; used_act boolean; w text[];
begin
  select coalesce(doctor_share_percent, 30) into def from orgs where id = _org;
  t0 := _from::timestamp at time zone 'Asia/Tashkent';
  t1 := (_to + 1)::timestamp at time zone 'Asia/Tashkent';
  for pid in
    select distinct m.patient_id from money_moves m
     where m.org_id = _org and m.branch_id = _branch and m.kind in ('income', 'refund') and m.patient_id is not null
       and m.moved_at >= t0 and m.moved_at < t1
  loop
    ids := '{}'; rem := '{}'; tot := '{}'; doc := '{}'; nms := '{}'; credit := 0;
    for ev in
      select 0 as k, a.created_at as at_, a.id, null::text as kind, 0::bigint as amount, null::uuid as act_id, null::uuid as branch_id,
             greatest(0, coalesce((select sum(ai.qty * ai.price) from act_items ai where ai.act_id = a.id), 0) - a.discount)::numeric as total,
             coalesce((select sum(ai.doctor_amount) from act_items ai where ai.act_id = a.id), 0)::numeric as dtotal,
             (select string_agg(ai.name, ', ' order by ai.id) from act_items ai where ai.act_id = a.id) as nm
        from acts a where a.patient_id = pid and a.status = 'closed' and a.created_at < t1
      union all
      select 1, m.moved_at, m.id, m.kind, m.amount, m.act_id, m.branch_id, 0, 0, null
        from money_moves m where m.patient_id = pid and m.kind in ('income', 'refund') and m.moved_at < t1
      order by 2, 1, 3
    loop
      if ev.k = 0 then
        -- Yangi ish: avvalgi avans bilan qoplanadigan qismi (shifokor ulushi to'lov kunida olingan).
        take := least(credit, ev.total);
        credit := credit - take;
        ids := ids || ev.id; tot := tot || ev.total; doc := doc || least(ev.dtotal, ev.total); rem := rem || (ev.total - take); nms := nms || coalesce(ev.nm, '');
        continue;
      end if;
      amt := ev.amount; sh := 0; used_def := false; used_act := false; w := '{}'; n := coalesce(array_length(ids, 1), 0);
      i := case when ev.act_id is null then null else array_position(ids, ev.act_id) end;
      if ev.kind = 'income' then
        if i is not null and rem[i] > 0 then
          take := least(amt, rem[i]); rem[i] := rem[i] - take; amt := amt - take;
          sh := sh + take * doc[i] / tot[i]; used_act := true; w := w || nms[i];
        end if;
        for j in 1..n loop
          exit when amt <= 0;
          if rem[j] > 0 then
            take := least(amt, rem[j]); rem[j] := rem[j] - take; amt := amt - take;
            sh := sh + take * doc[j] / tot[j]; used_act := true; if not nms[j] = any(w) then w := w || nms[j]; end if;
          end if;
        end loop;
        if amt > 0 then sh := sh + amt * def / 100; credit := credit + amt; used_def := true; end if;
      else
        if i is not null and tot[i] - rem[i] > 0 then
          take := least(amt, tot[i] - rem[i]); rem[i] := rem[i] + take; amt := amt - take;
          sh := sh - take * doc[i] / tot[i]; used_act := true; w := w || nms[i];
        end if;
        if amt > 0 and credit > 0 then
          take := least(amt, credit); credit := credit - take; amt := amt - take; sh := sh - take * def / 100; used_def := true;
        end if;
        for j in reverse n..1 loop
          exit when amt <= 0;
          if tot[j] - rem[j] > 0 then
            take := least(amt, tot[j] - rem[j]); rem[j] := rem[j] + take; amt := amt - take;
            sh := sh - take * doc[j] / tot[j]; used_act := true; if not nms[j] = any(w) then w := w || nms[j]; end if;
          end if;
        end loop;
        if amt > 0 then sh := sh - amt * def / 100; used_def := true; end if;
      end if;
      if ev.at_ >= t0 and ev.branch_id = _branch then
        o_move := ev.id; o_share := round(sh);
        o_base := case when used_act and used_def then 'mixed' when used_act then 'price' else 'default' end;
        o_works := nullif(array_to_string(w, '; '), '');
        return next;
      end if;
    end loop;
  end loop;
end $$;
