import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { Supplier } from "../types";

export async function listSuppliers() {
  const { data } = await api.get<Paginated<Supplier> | Supplier[]>("/suppliers/suppliers/");
  return unwrapList(data);
}

export async function searchSuppliers(query: string) {
  const { data } = await api.get<Paginated<Supplier> | Supplier[]>("/suppliers/suppliers/", {
    params: query ? { search: query } : undefined,
  });
  return unwrapList(data);
}

export interface SupplierInput {
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  notes?: string;
}

export async function createSupplier(input: SupplierInput) {
  const { data } = await api.post<Supplier>("/suppliers/suppliers/", input);
  return data;
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const { data } = await api.patch<Supplier>(`/suppliers/suppliers/${id}/`, input);
  return data;
}

export async function deleteSupplier(id: string) {
  await api.delete(`/suppliers/suppliers/${id}/`);
}
