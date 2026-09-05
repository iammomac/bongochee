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
  | "system_alert";

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
  supplierName: string;
  importDate: string;
  quantity: number;
  quantityRemaining: number;
  buyingPrice: number;
  minSellingPrice: number;
  maxSellingPrice: number;
}

export type PaymentMethod = "cash" | "mobile_money" | "card";

export interface SaleItem {
  id: string;
  stockItem: string;
  modelName: string;
  categoryName: string;
  imei: string;
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

export type ReturnCategory =
  | "display" | "battery" | "charging" | "camera" | "speaker" | "software" | "network" | "other";

export type ReturnStatus = "pending" | "processing" | "resolved" | "cancelled";

export interface SaleItemLookupResult {
  id: string;
  imei: string;
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
  imei: string;
  invoiceNumber: string;
  customerName: string;
  categoryName: string;
  modelName: string;
  returnDate: string;
  returnCategory: ReturnCategory;
  returnCategoryDisplay: string;
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

export interface SalesSummaryResponse {
  rows: ReportRow[];
  totals: ReportTotals;
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
  imei: string;
  invoiceNumber: string;
  customerName: string;
  categoryName: string;
  modelName: string;
  date: string;
  netPrice: number;
  buyingPrice: number;
  minSellingPrice: number;
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
  | "view_reports" | "export_reports"
  | "manage_users" | "manage_roles" | "manage_suppliers"
  | "view_profit" | "view_logs";
