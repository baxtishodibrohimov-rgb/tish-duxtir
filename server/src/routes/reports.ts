// Hisobotlar menyusidagi jadval hisobotlari: GET /api/reports/:slug?from&to&branch_id
// Har biri: ustunlar ro'yxati va SQL ($1 org, $2 filiallar, $3 dan, $4 gacha, $5 joriy foydalanuvchi).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, many } from '../db.js';
import { requireMember } from '../auth.js';
import { can } from '../perms.js';
import { forbidden, notFound } from '../errors.js';

type Col = [key: string, label: string, kind?: 'money' | 'num' | 'date' | 'datetime'];
interface Report { title: string; cols: Col[]; sql: string; mine?: boolean }

const PERIOD_VISITS = `v.org_id = $1 and v.branch_id = any($2) and v.starts_at >= $3::date and v.starts_at < $4::date + 1`;
const PERIOD_ACTS = `a.org_id = $1 and a.branch_id = any($2) and a.status = 'closed' and a.act_date between $3 and $4`;
const PERIOD_MONEY = `m.org_id = $1 and m.branch_id = any($2) and m.moved_at >= $3::date and m.moved_at < $4::date + 1`;
const BAL = `(select coalesce(sum(ai.qty * ai.price), 0) from acts a join act_items ai on ai.act_id = a.id where a.patient_id = p.id and a.status = 'closed')
  - (select coalesce(sum(a.discount), 0) from acts a where a.patient_id = p.id and a.status = 'closed')`;
const PAID = `(select coalesce(sum(case when kind = 'income' then amount when kind = 'refund' then -amount else 0 end), 0) from money_moves where patient_id = p.id)`;
const MEMBER = (col: string) => `coalesce((select full_name from members where user_id = ${col} and org_id = $1), '—')`;

export const REPORTS: Record<string, Report> = {
  'shifokorlar-yuklamasi': { title: 'Shifokorlar yuklamasi', cols: [['doctor', 'Shifokor'], ['visits', 'Qabullar', 'num'], ['completed', 'Bajarilgan', 'num'], ['no_show', 'Kelmagan', 'num'], ['hours', 'Soat', 'num']],
    sql: `select ${MEMBER('v.doctor_id')} doctor, count(*)::int visits, count(*) filter (where status = 'completed')::int completed,
            count(*) filter (where status = 'no_show')::int no_show, round(sum(extract(epoch from ends_at - starts_at)) / 3600.0, 1)::float hours
          from visits v where ${PERIOD_VISITS} and status <> 'cancelled' group by v.doctor_id order by visits desc` },
  'kabinetlar-bandligi': { title: 'Kabinetlar bandligi', cols: [['room', 'Kabinet'], ['visits', 'Qabullar', 'num'], ['hours', 'Band soat', 'num']],
    sql: `select coalesce(r.name, 'Kabinetsiz') room, count(*)::int visits, round(sum(extract(epoch from v.ends_at - v.starts_at)) / 3600.0, 1)::float hours
          from visits v left join rooms r on r.id = v.room_id where ${PERIOD_VISITS} and v.status not in ('cancelled', 'no_show', 'moved') group by r.name order by visits desc` },
  'bajarilgan-ishlar-soni': { title: 'Bajarilgan ishlar va ularning soni', cols: [['name', 'Xizmat'], ['qty', 'Soni', 'num'], ['total', 'Summa', 'money']],
    sql: `select ai.name, sum(ai.qty)::int qty, sum(ai.qty * ai.price) total from acts a join act_items ai on ai.act_id = a.id where ${PERIOD_ACTS} group by ai.name order by total desc` },
  'manba': { title: 'Yangi bemorlar klinika haqida qayerdan bilgan', cols: [['source', 'Manba'], ['n', 'Bemorlar', 'num']],
    sql: `select coalesce(nullif(source, ''), 'Ko‘rsatilmagan') source, count(*)::int n from patients
          where org_id = $1 and (home_branch_id = any($2) or home_branch_id is null) and created_at >= $3::date and created_at < $4::date + 1 and deleted_at is null group by 1 order by n desc` },
  'tahrirlash-jurnali': { title: 'Tahrirlash jurnali', cols: [['at', 'Vaqt', 'datetime'], ['who', 'Kim'], ['entity', 'Bo‘lim'], ['action', 'Amal']],
    sql: `select l.created_at at, ${MEMBER('l.user_id')} who, l.entity, l.action from audit_log l
          where l.org_id = $1 and l.created_at >= $3::date and l.created_at < $4::date + 1 order by l.created_at desc limit 1000` },
  'xarajat-kategoriyalari': { title: 'Xarajat kategoriyalari', cols: [['cat', 'Kategoriya'], ['n', 'Soni', 'num'], ['total', 'Summa', 'money']],
    sql: `select coalesce(c.name, 'Ko‘rsatilmagan') cat, count(*)::int n, sum(m.amount) total from money_moves m left join expense_categories c on c.id = m.category_id
          where ${PERIOD_MONEY} and m.kind = 'expense' group by c.name order by total desc` },
  'xarajatlar': { title: 'Xarajatlar', cols: [['at', 'Sana', 'date'], ['cat', 'Kategoriya'], ['cp', 'Kontragent'], ['note', 'Izoh'], ['amount', 'Summa', 'money']],
    sql: `select m.moved_at at, c.name cat, k.name cp, m.note, m.amount from money_moves m left join expense_categories c on c.id = m.category_id left join counterparties k on k.id = m.counterparty_id
          where ${PERIOD_MONEY} and m.kind = 'expense' order by m.moved_at desc` },
  'birlamchi-bemorlar': { title: 'Birlamchi bemorlar', cols: [['card', 'Karta №'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['source', 'Manba'], ['at', 'Ro‘yxatga olingan', 'date']],
    sql: `select card_number card, full_name name, phone, source, created_at at from patients
          where org_id = $1 and (home_branch_id = any($2) or home_branch_id is null) and created_at >= $3::date and created_at < $4::date + 1 and deleted_at is null order by created_at desc` },
  'moliyaviy': { title: 'Moliyaviy hisobotlar', cols: [['day', 'Kun', 'date'], ['income', 'Kirim', 'money'], ['refund', 'Qaytarilgan', 'money'], ['expense', 'Xarajat', 'money'], ['profit', 'Foyda', 'money']],
    sql: `select d::date as day, coalesce(sum(m.amount) filter (where m.kind = 'income'), 0) income, coalesce(sum(m.amount) filter (where m.kind = 'refund'), 0) refund,
            coalesce(sum(m.amount) filter (where m.kind = 'expense'), 0) expense,
            coalesce(sum(case when m.kind = 'income' then m.amount when m.kind in ('refund', 'expense') then -m.amount else 0 end), 0) profit
          from generate_series($3::date, $4::date, interval '1 day') d
          left join money_moves m on m.org_id = $1 and m.branch_id = any($2) and m.moved_at >= d and m.moved_at < d + interval '1 day'
          group by d order by d` },
  'davolash-rejalari': { title: 'Davolash rejalari', cols: [['at', 'Sana', 'date'], ['patient', 'Bemor'], ['title', 'Reja'], ['doctor', 'Shifokor'], ['approved', 'Tasdiqlangan'], ['rows', 'Xizmatlar', 'num'], ['done', 'Bajarilgan', 'num']],
    sql: `select t.plan_date at, p.full_name patient, t.title, ${MEMBER('t.doctor_id')} doctor, case when t.approved then 'Ha' else '' end approved,
            (select count(*) from jsonb_array_elements(t.stages) s, jsonb_array_elements(s->'rows') r)::int rows,
            (select count(*) from jsonb_array_elements(t.stages) s, jsonb_array_elements(s->'rows') r where r->>'status' = 'done')::int done
          from treatment_plans t join patients p on p.id = t.patient_id where t.org_id = $1 and t.plan_date between $3 and $4 order by t.plan_date desc` },
  'foyda-zarar': { title: 'Foyda va zarar', cols: [['branch', 'Filial'], ['work', 'Qilingan ish', 'money'], ['income', 'Kirim', 'money'], ['expense', 'Xarajat', 'money'], ['profit', 'Foyda', 'money']],
    sql: `select b.name branch,
            coalesce((select sum(ai.qty * ai.price) from acts a join act_items ai on ai.act_id = a.id where a.branch_id = b.id and a.status = 'closed' and a.act_date between $3 and $4), 0)
              - coalesce((select sum(a.discount) from acts a where a.branch_id = b.id and a.status = 'closed' and a.act_date between $3 and $4), 0) work,
            coalesce((select sum(case when kind = 'income' then amount when kind = 'refund' then -amount else 0 end) from money_moves m where m.branch_id = b.id and m.moved_at >= $3::date and m.moved_at < $4::date + 1), 0) income,
            coalesce((select sum(amount) from money_moves m where m.kind = 'expense' and m.branch_id = b.id and m.moved_at >= $3::date and m.moved_at < $4::date + 1), 0) expense,
            0 profit
          from branches b where b.org_id = $1 and b.id = any($2) order by b.position` },
  'bemor-vizitlari': { title: 'Bemor vizitlari', cols: [['at', 'Vaqt', 'datetime'], ['patient', 'Bemor'], ['doctor', 'Shifokor'], ['room', 'Kabinet'], ['status', 'Holati'], ['comment', 'Izoh']],
    sql: `select v.starts_at at, p.full_name patient, ${MEMBER('v.doctor_id')} doctor, r.name room, v.status, v.comment
          from visits v join patients p on p.id = v.patient_id left join rooms r on r.id = v.room_id where ${PERIOD_VISITS} order by v.starts_at` },
  'shifokor-smenalari': { title: 'Xodimlar smenalari', cols: [['day', 'Sana', 'date'], ['who', 'Xodim'], ['role', 'Lavozim'], ['from', 'Dan'], ['to', 'Gacha'], ['room', 'Kabinet']],
    sql: `select s.shift_date as day, m.full_name who, m.role, to_char(s.starts_at, 'HH24:MI') "from", to_char(s.ends_at, 'HH24:MI') "to", r.name room
          from staff_shifts s join members m on m.id = s.member_id left join rooms r on r.id = s.room_id
          where s.org_id = $1 and s.branch_id = any($2) and s.shift_date between $3 and $4 order by s.shift_date, s.starts_at` },
  'eslatmalar': { title: 'Eslatmalar', cols: [['at', 'Vaqt', 'datetime'], ['text', 'Matn'], ['patient', 'Bemor'], ['status', 'Holati']],
    sql: `select e.remind_at at, e.comment text, p.full_name patient, e.status from reminders e left join patients p on p.id = e.patient_id
          where e.org_id = $1 and e.remind_at >= $3::date and e.remind_at < $4::date + 1 order by e.remind_at` },
  'kutish-navbati': { title: 'Kutish navbati', cols: [['at', 'Qo‘shilgan', 'datetime'], ['patient', 'Bemor'], ['doctor', 'Shifokor'], ['comment', 'Izoh']],
    sql: `select w.created_at at, coalesce(p.full_name, w.patient_name) patient, ${MEMBER('w.doctor_id')} doctor, w.comment
          from waiting_list w left join patients p on p.id = w.patient_id where w.org_id = $1 and w.branch_id = any($2) order by w.created_at` },
  'mening-bemorlarim': { title: 'Mening bemorlar bo‘yicha bajarilgan ishlarim', mine: true, cols: [['patient', 'Bemor'], ['acts', 'Aktlar', 'num'], ['total', 'Summa', 'money']],
    sql: `select p.full_name patient, count(distinct a.id)::int acts, sum(ai.qty * ai.price) total from acts a join act_items ai on ai.act_id = a.id join patients p on p.id = a.patient_id
          where ${PERIOD_ACTS} and a.doctor_id = $5 group by p.full_name order by total desc` },
  'mening-ishlarim': { title: 'Mening bajarilgan ishlarim', mine: true, cols: [['day', 'Sana', 'date'], ['patient', 'Bemor'], ['name', 'Xizmat'], ['tooth', 'Tish'], ['total', 'Summa', 'money']],
    sql: `select a.act_date as day, p.full_name patient, ai.name, ai.tooth, ai.qty * ai.price total from acts a join act_items ai on ai.act_id = a.id join patients p on p.id = a.patient_id
          where ${PERIOD_ACTS} and a.doctor_id = $5 order by a.act_date desc` },
  'bemorlar': { title: 'Bemorlar', cols: [['card', 'Karta №'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['birth', 'Tug‘ilgan sana', 'date'], ['source', 'Manba'], ['at', 'Ro‘yxatga olingan', 'date']],
    sql: `select card_number card, full_name name, phone, birth_date birth, source, created_at at from patients where org_id = $1 and deleted_at is null order by full_name limit 5000` },
  'qarzdor-bemorlar': { title: 'Qarzdor bemorlar', cols: [['card', 'Karta №'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['billed', 'Qilingan ish', 'money'], ['paid', 'To‘langan', 'money'], ['debt', 'Qarz', 'money']],
    sql: `select * from (select p.card_number card, p.full_name name, p.phone, ${BAL} billed, ${PAID} paid, ${BAL} - ${PAID} debt from patients p where p.org_id = $1 and p.deleted_at is null) x where debt > 0 order by debt desc` },
  'avansli-bemorlar': { title: 'Avansli bemorlar', cols: [['card', 'Karta №'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['billed', 'Qilingan ish', 'money'], ['paid', 'To‘langan', 'money'], ['adv', 'Avans', 'money']],
    sql: `select * from (select p.card_number card, p.full_name name, p.phone, ${BAL} billed, ${PAID} paid, ${PAID} - ${BAL} adv from patients p where p.org_id = $1 and p.deleted_at is null) x where adv > 0 order by adv desc` },
  'tashlab-ketgan': { title: 'Tashlab ketgan bemorlar (6 oydan beri kelmagan, keyingi qabul yo‘q)', cols: [['card', 'Karta №'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['last', 'Oxirgi tashrif', 'date']],
    sql: `select p.card_number card, p.full_name name, p.phone, max(v.starts_at) last from patients p join visits v on v.patient_id = p.id and v.status = 'completed'
          where p.org_id = $1 and p.deleted_at is null and not exists (select 1 from visits f where f.patient_id = p.id and f.starts_at >= now())
          group by p.id having max(v.starts_at) < now() - interval '6 months' order by last` },
  'aktlar': { title: 'Aktlar', cols: [['day', 'Sana', 'date'], ['patient', 'Bemor'], ['doctor', 'Shifokor'], ['status', 'Holati'], ['total', 'Summa', 'money']],
    sql: `select a.act_date as day, p.full_name patient, ${MEMBER('a.doctor_id')} doctor, a.status,
            (select coalesce(sum(qty * price), 0) from act_items where act_id = a.id) - a.discount total
          from acts a join patients p on p.id = a.patient_id where a.org_id = $1 and a.branch_id = any($2) and a.act_date between $3 and $4 order by a.act_date desc` },
  'bajarilgan-ishlar': { title: 'Bajarilgan ishlar', cols: [['day', 'Sana', 'date'], ['patient', 'Bemor'], ['name', 'Xizmat'], ['tooth', 'Tish'], ['doctor', 'Shifokor'], ['total', 'Summa', 'money']],
    sql: `select a.act_date as day, p.full_name patient, ai.name, ai.tooth, ${MEMBER('a.doctor_id')} doctor, ai.qty * ai.price total
          from acts a join act_items ai on ai.act_id = a.id join patients p on p.id = a.patient_id where ${PERIOD_ACTS} order by a.act_date desc` },
  'bemor-tolovlari': { title: 'Bemor to‘lovlari', cols: [['at', 'Vaqt', 'datetime'], ['patient', 'Bemor'], ['box', 'Kassa'], ['kind', 'Turi'], ['amount', 'Summa', 'money']],
    sql: `select m.moved_at at, p.full_name patient, c.name box, case m.kind when 'refund' then 'Qaytarish' else 'To‘lov' end kind, m.amount
          from money_moves m join patients p on p.id = m.patient_id join cashboxes c on c.id = m.cashbox_id where ${PERIOD_MONEY} and m.kind in ('income', 'refund') order by m.moved_at desc` },
  'tugilgan-kunlar': { title: 'Tug‘ilgan kunlar (davr ichida)', cols: [['day', 'Kun'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['age', 'Yoshi', 'num']],
    sql: `select to_char(birth_date, 'DD.MM') as day, full_name name, phone, date_part('year', age($4::date, birth_date))::int age from patients
          where org_id = $1 and deleted_at is null and birth_date is not null
            and to_char(birth_date, 'MMDD') between to_char($3::date, 'MMDD') and to_char($4::date, 'MMDD') order by to_char(birth_date, 'MMDD')` },
  'ochirilgan-bemorlar': { title: 'O‘chirilgan bemorlar', cols: [['card', 'Karta №'], ['name', 'F.I.Sh.'], ['phone', 'Telefon'], ['at', 'O‘chirilgan', 'datetime']],
    sql: `select card_number card, full_name name, phone, deleted_at at from patients where org_id = $1 and deleted_at is not null order by deleted_at desc` },
  'demografiya': { title: 'Demografiya', cols: [['grp', 'Guruh'], ['female', 'Ayol', 'num'], ['male', 'Erkak', 'num'], ['unknown', 'Aniqlanmagan', 'num'], ['total', 'Jami', 'num']],
    sql: `select grp, count(*) filter (where gender = 'female')::int female, count(*) filter (where gender = 'male')::int male, count(*) filter (where gender is null)::int unknown, count(*)::int total
          from (select gender, case when birth_date is null then 'Yoshi noma’lum' when age(birth_date) < interval '18 years' then '0–17'
                  when age(birth_date) < interval '30 years' then '18–29' when age(birth_date) < interval '45 years' then '30–44'
                  when age(birth_date) < interval '60 years' then '45–59' else '60+' end grp from patients where org_id = $1 and deleted_at is null) x
          group by grp order by grp` },
};

const Q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), branch_id: z.string().uuid().optional() });

export async function reportRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string }; Querystring: Record<string, string> }>('/api/reports/table/:slug', async (req) => {
    const m = requireMember(req);
    const r = REPORTS[req.params.slug];
    if (!r) throw notFound('Bunday hisobot yo‘q');
    const q = Q.parse(req.query);
    const branches = q.branch_id ? [q.branch_id] : m.branch_ids;
    if (!r.mine) for (const b of branches) if (!can(m, 'reports.view', b)) throw forbidden();
    // Barcha parametrlar CTE da turlanadi: hisobot SQL ularning hammasini ishlatmasa ham xato bermaydi.
    const sql = `with _p as (select $1::uuid a, $2::uuid[] b, $3::date c, $4::date d, $5::uuid e) ${r.sql}`;
    const rows = await tx(m.user_id, (c) => many<Record<string, unknown>>(c, sql, [m.org_id, branches, q.from, q.to, m.user_id]));
    if (req.params.slug === 'foyda-zarar') for (const x of rows) x.profit = Number(x.income) - Number(x.expense);
    return { title: r.title, cols: r.cols, rows };
  });
}
