export type Role = 'owner' | 'doctor' | 'assistant' | 'admin' | 'curator' | 'storekeeper';

export type Perm =
  | 'schedule.view' | 'schedule.edit'
  | 'patients.view' | 'patients.edit'
  | 'cashbox.view' | 'cashbox.edit'
  | 'warehouse.view' | 'warehouse.edit' | 'warehouse.admin'
  | 'reports.view' | 'settings.edit' | 'staff.manage';

export interface User { id: string; full_name: string; email: string | null; phone: string | null; avatar_url: string | null }

export interface Org {
  id: string; name: string; logo_url: string | null; currency: string; timezone: string;
  stock_mode: 'simple' | 'mid' | 'exact'; allow_negative_stock: boolean; telegram_chat_id: string | null; doctor_share_percent: number;
  lab_warn_days: number;
}

export interface Branch {
  id: string; org_id: string; name: string; address: string | null; phone: string | null;
  slot_minutes: number; work_start: string; work_end: string; days_visible: number; position: number; archived: boolean;
}

export interface Member {
  id: string; user_id: string; role: Role; full_name: string; color: string; is_active: boolean;
  all_branches: boolean; permissions: Partial<Record<Perm, boolean>>; branch_ids: string[];
}

export interface Room { id: string; org_id: string; branch_id: string; name: string; color: string; position: number; is_active: boolean }

export interface PatientStatus {
  id: string; org_id: string; name: string; color: string; kind: 'manual' | 'reminder';
  reminder_months: number | null; position: number;
}

export interface Patient {
  id: string; org_id: string; card_number: string; last_name: string; first_name: string; middle_name: string;
  home_branch_id: string | null; full_name: string; phone: string | null; phone2: string | null; birth_date: string | null; gender: 'male' | 'female' | null;
  address: string | null; source: string | null; referrer: string | null; important_info: string | null; notes: string | null;
  status_ids: string[]; created_at: string; email: string | null; discount_percent: number; curator_id: string | null;
  contact_channel: 'call' | 'tg' | 'sms' | 'wa' | null; payer: string | null; registered_on: string; photo_file_id: string | null;
}

export type VisitStatus = 'planned' | 'confirmed' | 'arrived' | 'completed' | 'no_show' | 'moved' | 'cancelled' | 'booked';
export interface Visit {
  id: string; org_id: string; branch_id: string; patient_id: string; doctor_id: string | null; assistant_id: string | null;
  room_id: string | null; starts_at: string; ends_at: string; status: VisitStatus; is_first_visit: boolean;
  comment: string | null; mood: string | null; created_at: string; created_by: string | null;
}
export interface VisitItem { id: string; visit_id: string; price_item_id: string | null; name: string; price: number }

export type CatIcon = 'cons' | 'tooth' | 'hyg' | 'crown' | 'braces' | 'surg';
export interface PriceCategory { id: string; org_id: string; name: string; color_idx: number; position: number; icon: CatIcon; ask_teeth: boolean }
export interface PriceItem {
  id: string; org_id: string; category_id: string; name: string; code: string | null; price: number;
  position: number; archived: boolean; is_lab: boolean; tech_price: number;
  doctor_share_type: 'pct' | 'sum' | null; doctor_share: number | null;
}

export interface Cashbox { id: string; org_id: string; branch_id: string; name: string; method: string; position: number; archived: boolean }

export type CounterpartyType = 'supplier' | 'doctor' | 'assistant' | 'technician' | 'other';
export interface CounterpartyKind { id: string; org_id: string; name: string; position: number }
export interface Counterparty {
  id: string; org_id: string; type: CounterpartyType; type_id: string | null; name: string; phone: string | null; email: string | null; website: string | null;
  address: string | null; contact_person: string | null; inn: string | null; bank_name: string | null;
  bank_account: string | null; mfo: string | null; note: string | null; archived: boolean;
}

export interface ExpenseCategory { id: string; org_id: string; name: string; archived: boolean }

export type MoneyKind = 'income' | 'expense' | 'transfer' | 'refund';
export interface MoneyMove {
  id: string; org_id: string; branch_id: string; kind: MoneyKind; cashbox_id: string; to_cashbox_id: string | null; amount: number;
  patient_id: string | null; doctor_id: string | null; act_id: string | null; counterparty_id: string | null;
  category_id: string | null; stock_doc_id: string | null; note: string | null; moved_at: string; created_by: string | null;
}

export interface Act {
  id: string; org_id: string; branch_id: string; patient_id: string; visit_id: string | null; doctor_id: string | null;
  warehouse_id: string | null; act_date: string; status: 'draft' | 'closed' | 'cancelled'; discount: number; created_at: string;
}
export interface ActItem { id: string; act_id: string; price_item_id: string | null; name: string; tooth: string | null; qty: number; price: number }

export interface Warehouse {
  id: string; org_id: string; branch_id: string; name: string; responsible_id: string | null; is_main: boolean; note: string | null; archived: boolean;
}
export interface ProductCategory { id: string; org_id: string; parent_id: string | null; name: string; position: number }
export interface Brand { id: string; org_id: string; name: string; logo_url: string | null; archived: boolean }
export interface Product {
  id: string; org_id: string; category_id: string | null; brand_id: string | null; name: string; sku: string | null;
  barcode: string | null; unit: string; pack_unit: string | null; pack_qty: number; last_cost: number; note: string | null; archived: boolean;
  image_path?: string | null;
}
export interface ProductWhSetting {
  product_id: string; warehouse_id: string; org_id: string; visible: boolean; min_qty: number; order_qty: number; location: string | null;
}
export type StockDocType = 'receipt' | 'writeoff' | 'transfer' | 'return';
export interface StockDoc {
  id: string; org_id: string; type: StockDocType; number: string; doc_date: string; warehouse_id: string;
  to_warehouse_id: string | null; counterparty_id: string | null; responsible_id: string | null; reason: string | null;
  note: string | null; status: 'draft' | 'posted' | 'reversed'; reversal_of: string | null; act_id: string | null;
  posted_at: string | null; created_at: string;
}
export interface StockDocLine { id: string; doc_id: string; product_id: string; qty: number; price: number; position: number }
export interface StockBalance { product_id: string; warehouse_id: string; org_id: string; qty: number; value: number }
export interface StockHistoryRow {
  id: number; qty: number; cost: number; moved_at: string; warehouse_id: string; doc_id: string; type: StockDocType;
  number: string; reason: string | null; status: StockDoc['status']; counterparty_id: string | null; to_warehouse_id: string | null;
  doc_warehouse_id: string; act_patient?: string | null; act_works?: string | null;
}
export interface RecordFile {
  id: string; org_id: string; record_id: string | null; patient_id: string; kind: 'image' | 'audio' | 'xray' | 'file';
  name: string | null; mime: string | null; size_bytes: number | null; created_at: string;
}
export interface TreatmentRecord {
  id: string; org_id: string; branch_id: string | null; patient_id: string; visit_id: string | null; doctor_id: string | null;
  tooth: string | null; diagnosis: string | null; description: string | null; created_at: string;
}
export interface CalcCard { id: string; org_id: string; price_item_id: string; product_id: string; qty: number; group_id: string | null; position: number }
export interface WorkMatGroup { id: string; org_id: string; price_item_id: string; name: string; position: number }
export interface Reminder {
  id: string; org_id: string; patient_id: string | null; assigned_to: string | null; remind_at: string; comment: string | null;
  status: 'planned' | 'sent' | 'cancelled' | 'done'; audience: 'me' | 'admins' | 'owners'; created_by: string | null; created_at: string;
}
export interface WaitItem {
  id: string; org_id: string; branch_id: string; patient_id: string | null; patient_name: string; doctor_id: string | null;
  comment: string | null; created_at: string;
}
