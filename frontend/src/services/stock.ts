import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { Category, PhoneModel, StockItem } from "../types";

export interface StockInItemPayload {
  category: string;
  model: string;
  quantity: number;
  buyingPrice: number;
  minSellingPrice: number;
  maxSellingPrice: number;
}

export interface StockInPayload {
  supplier: string;
  importDate: string;
  invoiceNumber?: string;
  notes?: string;
  items: StockInItemPayload[];
}

export interface ImportedStockRow {
  rowNumber: number;
  category: Category | null;
  model: PhoneModel | null;
  quantity: number | null;
  buyingPrice: number | null;
  minSellingPrice: number | null;
  maxSellingPrice: number | null;
  error: string | null;
}

export async function createStockIn(payload: StockInPayload) {
  const { data } = await api.post("/stock/stock-ins/", payload);
  return data;
}

export async function importStockExcel(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<{ rows: ImportedStockRow[] }>("/stock/import-preview/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.rows;
}

export async function listRecentStockItems() {
  const { data } = await api.get<Paginated<StockItem> | StockItem[]>("/stock/stock-items/");
  return unwrapList(data);
}

export interface StockItemUpdatePayload {
  category: string;
  model: string;
  quantity: number;
  buyingPrice: number;
  minSellingPrice: number;
  maxSellingPrice: number;
}

export async function updateStockItem(id: string, payload: StockItemUpdatePayload) {
  const { data } = await api.patch<StockItem>(`/stock/stock-items/${id}/`, payload);
  return data;
}

export async function downloadStockImportTemplate() {
  const response = await api.get("/stock/import-template/", { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = "bongochee_stock_import_template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
