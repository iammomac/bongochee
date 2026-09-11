import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { AvailablePhone, PaymentMethod, Sale, StockItem } from "../types";

export interface SaleItemPayload {
  stockItem: string;
  imei: string;
  sellingPrice: number;
  discount?: number;
}

export interface SaleCreatePayload {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  items: SaleItemPayload[];
}

export async function searchAvailableStock(query: string) {
  const { data } = await api.get<Paginated<StockItem> | StockItem[]>("/stock/stock-items/", {
    params: { quantity_remaining__gt: 0, ...(query ? { search: query } : {}) },
  });
  return unwrapList(data).map(
    (item): AvailablePhone => ({
      ...item,
      name: `${item.categoryName} ${item.modelName}`,
    }),
  );
}

export async function createSale(payload: SaleCreatePayload) {
  const { data } = await api.post<Sale>("/sales/sales/", payload);
  return data;
}

export async function listRecentSales() {
  const { data } = await api.get<Paginated<Sale> | Sale[]>("/sales/sales/");
  return unwrapList(data);
}

export interface SaleItemUpdatePayload {
  id: string;
  stockItem: string;
  // Echoed back from the existing item, never actually changed -- the backend
  // ignores it on update. Nullable to match SaleItem now that IMEI is optional.
  imei: string | null;
  sellingPrice: number;
  discount: number;
}

export interface SaleUpdatePayload {
  customerName: string;
  customerPhone?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  items: SaleItemUpdatePayload[];
}

export async function updateSale(id: string, payload: SaleUpdatePayload) {
  const { data } = await api.patch<Sale>(`/sales/sales/${id}/`, payload);
  return data;
}

export async function deleteSale(id: string) {
  await api.delete(`/sales/sales/${id}/`);
}
