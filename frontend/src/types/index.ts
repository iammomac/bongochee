export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email?: string;
  photoUrl?: string;
  role: Role | null;
  isActive: boolean;
  isActiveEmployee: boolean;
  isSuperuser: boolean;
  mustChangePassword: boolean;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystemRole: boolean;
}

export interface Permission {
  id: number;
  codename: string;
  label: string;
  category: string;
}

export interface PasswordChangeRequest {
  id: string;
  user: User;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  tempPasswordIssued: boolean;
}

export type NotificationType =
  | "low_stock"
  | "out_of_stock"
  | "password_request"
  | "failed_login"
  | "new_return"
  | "system_alert"
  | "note_shared";

export interface Notification {
  id: string;
  notificationType: NotificationType;
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export interface PhoneModel {
  id: string;
  category: string;
  name: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface StockItem {
  id: string;
  category: string;
  categoryName: string;
  model: string;
  modelName: string;
  supplier: string;
  supplierName: string;
  importDate: string;
  invoiceNumber: string;
  // Lines sharing this line's supplier/date/invoice; editing those changes all of them.
  batchSize: number;
  quantity: number;
  quantityRemaining: number;
  buyingPrice: number;
  minSellingPrice: number;
  maxSellingPrice: number;
  notes: string;
}

export type PaymentMethod = "cash" | "mobile_money" | "card";

export interface SaleItem {
  id: string;
  stockItem: string;
  modelName: string;
  categoryName: string;
  imei: string | null;
  sellingPrice: number;
  discount: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  notes: string;
  items: SaleItem[];
  soldBy: string;
  soldByName: string;
  createdAt: string;
}

export interface AvailablePhone extends StockItem {
  name: string;
}

export type LoanStatus = "open" | "partial" | "paid";

export interface LoanSaleItem {
  id: string;
  stockItem: string;
  modelName: string;
  categoryName: string;
  imei: string | null;
  sellingPrice: number;
  discount: number;
}

export interface LoanPayment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidDate: string;
  notes: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export interface LoanSale {
  id: string;
  invoiceNumber: string;
  businessName: string;
  contactPerson: string;
  contactPhone: string;
  notes: string;
  items: LoanSaleItem[];
  payments: LoanPayment[];
  soldBy: string;
  soldByName: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  loanStatus: LoanStatus;
  // What the sale is worth once fully paid (price less discount).
  revenue: number;
  // Cost and expected profit are only sent to users with view_profit.
  cost?: number;
  expectedProfit?: number;
  createdAt: string;
}

export interface LoanTrendPoint {
  date: string;
  loans: number;
  units: number;
  revenue: number;
  expectedProfit?: number;
}

export interface LoanSummary {
  days: number;
  trend: LoanTrendPoint[];
  totals: { loans: number; units: number; revenue: number; expectedProfit?: number };
  // The whole loan book, independent of the chart's day window.
  receivables: {
    total: number;
    paid: number;
    owed: number;
    loansOpen: number;
    loansPartial: number;
    loansPaid: number;
  };
}

// A kind of fault a return is filed under ("Battery", "Water damage"...) -- picked from the
// existing ones or added on the spot.
export interface ReturnCategory {
  id: string;
  name: string;
  createdAt: string;
}

export type ReturnStatus = "pending" | "processing" | "resolved" | "cancelled";

export interface SaleItemLookupResult {
  id: string;
  imei: string | null;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  categoryName: string;
  modelName: string;
  saleDate: string;
  soldByName: string;
}

export interface ReturnPhoto {
  id: string;
  image: string;
}

export interface ReturnRecord {
  id: string;
  saleItem: string;
  imei: string | null;
  invoiceNumber: string;
  customerName: string;
  categoryName: string;
  modelName: string;
  returnDate: string;
  returnCategory: string; // the ReturnCategory's id
  returnCategoryDisplay: string; // and its name
  description: string;
  status: ReturnStatus;
  processedBy: string;
  photos: ReturnPhoto[];
  createdAt: string;
}

export type ReportGroupBy = "day" | "category" | "model" | "user" | "payment_method" | "supplier";

export interface ReportRow {
  key: string;
  label: string;
  units: number;
  revenue: number;
  profit?: number;
}

export interface ReportTotals {
  units: number;
  revenue: number;
  profit?: number;
}

// One line of a report's full per-transaction table. Which keys exist depends on the
// report (and profit-gated ones are absent without view_profit), so the shape is
// described by the column config in pages/reports/DetailTable.tsx rather than a
// per-report interface.
export type DetailRow = { key: string } & Record<string, string | number | null>;

export interface ReportDetails {
  details: DetailRow[];
  detailTotals: Record<string, number>;
}

export interface SalesSummaryResponse extends ReportDetails {
  rows: ReportRow[];
  totals: ReportTotals;
}

export interface ReportWithDetails<Row> extends ReportDetails {
  rows: Row[];
}

export interface ReturnsSummaryRow {
  key: string;
  label: string;
  count: number;
}

export interface StockSummaryRow {
  key: string;
  label: string;
  quantity: number;
  value?: number;
}

export interface SupplierSummaryRow {
  key: string;
  label: string;
  quantity: number;
  value?: number;
}

export interface LossReportRow {
  id: string;
  imei: string | null;
  invoiceNumber: string;
  customerName: string;
  categoryName: string;
  modelName: string;
  supplierName: string;
  date: string;
  time: string;
  soldByName: string;
  units: number;
  priceSold: number;
  discount: number;
  netPrice: number;
  buyingPrice: number;
  minSellingPrice: number;
  profit: number;
  condition: string;
  saleNotes: string;
  lossType: "below_buying_price" | "below_minimum_price";
  lossTypeDisplay: string;
}

export interface PersonReport {
  stockAdded: { batches: number; quantity: number; value?: number };
  salesMade: { units: number; revenue: number; profit?: number };
  returnsProcessed: number;
}

export interface ActivityLogEntry {
  id: string;
  user: string | null;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export type PermissionCode =
  | "view_dashboard" | "add_stock" | "edit_stock" | "delete_stock"
  | "create_sales" | "edit_sales" | "delete_sales" | "create_returns" | "edit_returns"
  | "create_loan_sales" | "edit_loan_sales" | "delete_loan_sales" | "record_loan_payments"
  | "view_reports" | "export_reports"
  | "manage_users" | "manage_roles" | "manage_suppliers"
  | "view_profit" | "view_logs";

export type NoteAccess = "owner" | "edit" | "view";
export type NoteSharePermission = "edit" | "view";

export interface NoteShareEntry {
  user: string;
  userName: string;
  permission: NoteSharePermission;
}

// The light shape the list pane uses (no full body).
export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  isPinned: boolean;
  owner: string;
  ownerName: string;
  myAccess: NoteAccess;
  sharedCount: number;
  lastEditedByName: string | null;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  owner: string;
  ownerName: string;
  myAccess: NoteAccess;
  shares: NoteShareEntry[];
  lastEditedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotePerson {
  id: string;
  name: string;
}

// Loan sales report. Payment figures (paid / outstanding) are absent when they can't be
// worked out -- grouping or filtering by product, since payments belong to the whole loan --
// and expectedProfit is absent without view_profit.
export interface LoanReportRow {
  key: string;
  label: string;
  loans: number;
  units: number;
  revenue: number;
  expectedProfit?: number;
  paid?: number;
  outstanding?: number;
}

export interface LoanReportTotals {
  loans: number;
  units: number;
  revenue: number;
  expectedProfit?: number;
  paid?: number;
  outstanding?: number;
}

export interface LoanSalesReportResponse extends ReportDetails {
  rows: LoanReportRow[];
  totals: LoanReportTotals;
}
