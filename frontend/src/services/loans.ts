import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { LoanSale, PaymentMethod } from "../types";

export interface LoanSaleItemPayload {
  stockItem: string;
  imei: string;
  sellingPrice: number;
  discount?: number;
}

export interface LoanSaleCreatePayload {
  invoiceNumber: string;
  businessName: string;
  contactPerson?: string;
  contactPhone?: string;
  notes?: string;
  items: LoanSaleItemPayload[];
}

export async function createLoanSale(payload: LoanSaleCreatePayload) {
  const { data } = await api.post<LoanSale>("/loans/loan-sales/", payload);
  return data;
}

export async function listLoanSales() {
  const { data } = await api.get<Paginated<LoanSale> | LoanSale[]>("/loans/loan-sales/");
  return unwrapList(data);
}

export interface LoanSaleItemUpdatePayload {
  id: string;
  sellingPrice: number;
  discount: number;
}

export interface LoanSaleUpdatePayload {
  businessName: string;
  contactPerson?: string;
  contactPhone?: string;
  notes?: string;
  items?: LoanSaleItemUpdatePayload[];
}

export async function updateLoanSale(id: string, payload: LoanSaleUpdatePayload) {
  const { data } = await api.patch<LoanSale>(`/loans/loan-sales/${id}/`, payload);
  return data;
}

export async function deleteLoanSale(id: string) {
  await api.delete(`/loans/loan-sales/${id}/`);
}

export interface LoanPaymentPayload {
  amount: number;
  paymentMethod: PaymentMethod;
  paidDate: string;
  notes?: string;
}

export async function addLoanPayment(loanId: string, payload: LoanPaymentPayload) {
  const { data } = await api.post<LoanSale>(`/loans/loan-sales/${loanId}/payments/`, payload);
  return data;
}

export async function removeLoanPayment(loanId: string, paymentId: string) {
  const { data } = await api.delete<LoanSale>(`/loans/loan-sales/${loanId}/payments/${paymentId}/`);
  return data;
}
