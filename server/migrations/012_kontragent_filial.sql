-- =====================================================================
-- Kontragentlar umumiy, lekin summalari har bir filialda alohida.
--   * Qo'lda kiritilgan hisoblar (counterparty_invoices) filialga bog'lanadi.
--   * Eski hisoblar: kontragentga faqat bitta filial kassasidan to'langan bo'lsa — o'sha filial;
--     aks holda hisobni kiritgan xodim faqat bitta filialda ishlasa — o'sha filial; qolganlari — birinchi filial.
--   * Yetkazib beruvchi qarzi filial bo'yicha: supplier_debts_branch().
-- =====================================================================
alter table counterparty_invoices add column if not exists branch_id uuid references branches(id);

update counterparty_invoices i set branch_id = coalesce(
  (select min(mm.branch_id::text)::uuid from money_moves mm
    where mm.counterparty_id = i.counterparty_id and mm.kind = 'expense'
   having count(distinct mm.branch_id) = 1),
  (select min(mb.branch_id::text)::uuid from members m join member_branches mb on mb.member_id = m.id
    where m.org_id = i.org_id and m.user_id = i.created_by and not m.all_branches
   having count(distinct mb.branch_id) = 1),
  (select b.id from branches b where b.org_id = i.org_id order by b.position, b.created_at limit 1))
 where i.branch_id is null;

alter table counterparty_invoices alter column branch_id set not null;
create index if not exists counterparty_invoices_branch on counterparty_invoices (branch_id, counterparty_id);

create or replace function supplier_debts_branch(_org uuid, _branch uuid)
returns table (counterparty_id uuid, org_id uuid, name text, purchased numeric, paid numeric)
language sql stable as $$
  select c.id, c.org_id, c.name,
    coalesce((select sum(l.qty * l.price) from stock_docs d join stock_doc_lines l on l.doc_id = d.id join warehouses w on w.id = d.warehouse_id
               where d.counterparty_id = c.id and d.type = 'receipt' and d.status = 'posted' and d.reversal_of is null and w.branch_id = _branch), 0)
    - coalesce((select sum(-m.cost) from stock_docs d join stock_moves m on m.doc_id = d.id join warehouses w on w.id = d.warehouse_id
               where d.counterparty_id = c.id and d.type = 'return' and d.status = 'posted' and d.reversal_of is null and w.branch_id = _branch), 0),
    coalesce((select sum(mm.amount) from money_moves mm where mm.counterparty_id = c.id and mm.kind = 'expense' and mm.branch_id = _branch), 0)
  from counterparties c
  where c.org_id = _org and c.type = 'supplier'
$$;
