import { api } from "./api";
import type {
  LossReportRow,
  PersonReport,
  ReturnsSummaryRow,
  SalesSummaryResponse,
  StockSummaryRow,
  SupplierSummaryRow,
} from "../types";

// Query strings are never touched by the camelCase parser (that only rewrites
// request/response bodies), so every param below must be the backend's own
// snake_case name, not the camelCase convention used everywhere else in the app.
export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  model?: string;
  supplier?: string;
  user?: string;
  paymentMethod?: string;
  groupBy?: string;
}

function toParams(filters: ReportFilters, extra?: Record<string, string>) {
  const params: Record<string, string> = { ...extra };
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;
  if (filters.category) params.category = filters.category;
  if (filters.model) params.model = filters.model;
  if (filters.supplier) params.supplier = filters.supplier;
  if (filters.user) params.user = filters.user;
  if (filters.paymentMethod) params.payment_method = filters.paymentMethod;
  if (filters.groupBy) params.group_by = filters.groupBy;
  return params;
}

export async function getSalesSummary(filters: ReportFilters) {
  const { data } = await api.get<SalesSummaryResponse>("/reports/sales-summary/", { params: toParams(filters) });
  return data;
}

export async function getReturnsSummary(filters: ReportFilters) {
  const { data } = await api.get<{ rows: ReturnsSummaryRow[] }>("/reports/returns-summary/", {
    params: toParams(filters),
  });
  return data.rows;
}

export async function getStockSummary(filters: ReportFilters) {
  const { data } = await api.get<{ rows: StockSummaryRow[] }>("/reports/stock-summary/", {
    params: toParams(filters),
  });
  return data.rows;
}

export async function getSupplierSummary(filters: ReportFilters) {
  const { data } = await api.get<{ rows: SupplierSummaryRow[] }>("/reports/supplier-summary/", {
    params: toParams(filters),
  });
  return data.rows;
}

export async function getLossReport(filters: ReportFilters) {
  const { data } = await api.get<{ rows: LossReportRow[] }>("/reports/loss/", { params: toParams(filters) });
  return data.rows;
}

export async function getPersonReport(userId: string, filters: ReportFilters) {
  const { data } = await api.get<PersonReport>(`/reports/person/${userId}/`, { params: toParams(filters) });
  return data;
}

export type ExportableReport = "sales" | "returns" | "stock" | "supplier" | "loss";

const EXPORT_ENDPOINTS: Record<ExportableReport, string> = {
  sales: "/reports/sales-summary/",
  returns: "/reports/returns-summary/",
  stock: "/reports/stock-summary/",
  supplier: "/reports/supplier-summary/",
  loss: "/reports/loss/",
};

export async function downloadReportExport(
  reportType: ExportableReport,
  filters: ReportFilters,
  format: "xlsx" | "pdf",
) {
  const response = await api.get(EXPORT_ENDPOINTS[reportType], {
    params: toParams(filters, { export: format }),
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${reportType}_report.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Admin/super only — see IsAdminOrSuper on FullBackupExportView (backend/reports/views.py).
export async function downloadFullBackup() {
  const response = await api.get("/reports/full-backup/", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = `bongochee_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
