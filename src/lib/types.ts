export type Role = 'owner' | 'doctor' | 'assistant' | 'admin' | 'curator' | 'storekeeper';

export type Perm =
  | 'schedule.view' | 'schedule.edit'
  | 'patients.view' | 'patients.edit'
  | 'cashbox.view' | 'cashbox.edit'
  | 'warehouse.view' | 'warehouse.edit' | 'warehouse.admin'
  | 'reports.view' | 'settings.edit' | 'staff.manage';

export interface Clinic {
  id: string; owner_id: string; name: string; logo_url: string | null; phone: string | null; address: string | null;
  slot_minutes: number; work_start: string; work_end: string; days_visible: number;
  stock_mode: 'simple' | 'mid' | 'exact'; allow_negative_stock: boolean; access_until: string;
}

export interface Member {
  id: string; clinic_id: string; user_id: string; role: Role; full_name: string; color: string;
  default_room_id: string | null; permissions: Partial<Record<Perm, boolean>>; is_active: boolean;
}

export interface Room { id: string; clinic_id: string; name: string; color: string; position: number; is_active: boolean }

export interface PatientStatus {
  id: string; clinic_id: string; name: string; color: string; kind: 'manual' | 'reminder';
  reminder_months: number | null; position: number;
}

export interface Patient {
  id: string; clinic_id: string; card_number: string; last_name: string; first_name: string; middle_name: string;
  full_name: string; phone: string | null; phone2: string | null; birth_date: string | null; gender: 'male' | 'female' | null;
  address: string | null; source: string | null; referrer: string | null; important_info: string | null; notes: string | null;
  status_ids: string[]; created_at: string;
}

export type VisitStatus = 'planned' | 'confirmed' | 'arrived' | 'completed' | 'no_show' | 'cancelled';
export interface Visit {
  id: string; clinic_id: string; patient_id: string; doctor_id: string | null; assistant_id: string | null;
  room_id: string | null; starts_at: string; ends_at: string; status: VisitStatus; is_first_visit: boolean;
  comment: string | null; patient?: Pick<Patient, 'id' | 'full_name' | 'phone' | 'card_number'>;
}

export interface PriceCategory { id: string; clinic_id: string; name: string; color_idx: number; position: number }
export interface PriceItem {
  id: string; clinic_id: string; category_id: string; name: string; code: string | null; price: number;
  position: number; archived: boolean;
}

export interface Cashbox { id: string; clinic_id: string; name: string; method: string; position: number; archived: boolean }

export type CounterpartyType = 'supplier' | 'doctor' | 'assistant' | 'lab' | 'technician' | 'other';
export interface Counterparty {
  id: string; clinic_id: string; type: CounterpartyType; name: string; phone: string | null; email: string | null;
  address: string | null; contact_person: string | null; inn: string | null; bank_name: string | null;
  bank_account: string | null; mfo: string | null; note: string | null; archived: boolean;
}

export interface ExpenseCategory { id: string; clinic_id: string; name: string; archived: boolean }

export type MoneyKind = 'income' | 'expense' | 'transfer' | 'refund';
export interface MoneyMove {
  id: string; clinic_id: string; kind: MoneyKind; cashbox_id: string; to_cashbox_id: string | null; amount: number;
  patient_id: string | null; doctor_id: string | null; act_id: string | null; counterparty_id: string | null;
  category_id: string | null; stock_doc_id: string | null; note: string | null; moved_at: string; created_by: string | null;
}

export interface Act {
  id: string; clinic_id: string; patient_id: string; visit_id: string | null; doctor_id: string | null;
  warehouse_id: string | null; act_date: string; status: 'draft' | 'closed' | 'cancelled'; discount: number; created_at: string;
  act_items?: ActItem[];
}
export interface ActItem { id: string; act_id: string; price_item_id: string | null; name: string; tooth: string | null; qty: number; price: number }

export interface Warehouse {
  id: string; clinic_id: string; name: string; responsible_id: string | null; is_main: boolean; note: string | null; archived: boolean;
}
export interface ProductCategory { id: string; clinic_id: string; parent_id: string | null; name: string; position: number }
export interface Brand { id: string; clinic_id: string; name: string; logo_url: string | null; archived: boolean }
export interface Product {
  id: string; clinic_id: string; category_id: string | null; brand_id: string | null; name: string; sku: string | null;
  barcode: string | null; unit: string; pack_unit: string | null; pack_qty: number; last_cost: number; note: string | null; archived: boolean;
}
export interface ProductWhSetting {
  product_id: string; warehouse_id: string; clinic_id: string; visible: boolean; min_qty: number; order_qty: number; location: string | null;
}
export type StockDocType = 'receipt' | 'writeoff' | 'transfer' | 'return';
export interface StockDoc {
  id: string; clinic_id: string; type: StockDocType; number: string; doc_date: string; warehouse_id: string;
  to_warehouse_id: string | null; counterparty_id: string | null; responsible_id: string | null; reason: string | null;
  note: string | null; status: 'draft' | 'posted' | 'reversed'; reversal_of: string | null; act_id: string | null;
  posted_at: string | null; created_at: string; stock_doc_lines?: StockDocLine[];
}
export interface StockDocLine { id: string; doc_id: string; product_id: string; qty: number; price: number; position: number }
export interface StockBalance { product_id: string; warehouse_id: string; clinic_id: string; qty: number; value: number }
export interface StockMove {
  id: number; product_id: string; warehouse_id: string; doc_id: string; qty: number; cost: number; moved_at: string;
  stock_docs?: Pick<StockDoc, 'type' | 'number' | 'reason'>;
}
export interface CalcCard { id: string; clinic_id: string; price_item_id: string; product_id: string; qty: number }
