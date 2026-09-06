import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { ReturnCategory, ReturnRecord, ReturnStatus, SaleItemLookupResult } from "../types";

export async function lookupSaleItem(query: string) {
  const { data } = await api.get<SaleItemLookupResult[]>("/returns/lookup/", {
    params: { q: query },
  });
  return data;
}

export interface ReturnCreatePayload {
  saleItem: string;
  returnDate: string;
  returnCategory: ReturnCategory;
  description?: string;
}

export async function createReturn(payload: ReturnCreatePayload) {
  const { data } = await api.post<ReturnRecord>("/returns/returns/", payload);
  return data;
}

export async function uploadReturnPhoto(returnId: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  await api.post(`/returns/returns/${returnId}/photos/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function listRecentReturns() {
  const { data } = await api.get<Paginated<ReturnRecord> | ReturnRecord[]>("/returns/returns/");
  return unwrapList(data);
}

export async function updateReturnStatus(id: string, status: ReturnStatus) {
  const { data } = await api.patch<ReturnRecord>(`/returns/returns/${id}/`, { status });
  return data;
}

export interface ReturnUpdatePayload {
  returnDate?: string;
  returnCategory?: ReturnCategory;
  description?: string;
}

export async function updateReturn(id: string, payload: ReturnUpdatePayload) {
  const { data } = await api.patch<ReturnRecord>(`/returns/returns/${id}/`, payload);
  return data;
}
