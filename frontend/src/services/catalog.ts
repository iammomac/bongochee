import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { Category, PhoneModel } from "../types";

export async function searchCategories(query: string) {
  const { data } = await api.get<Paginated<Category> | Category[]>("/catalog/categories/", {
    params: query ? { search: query } : undefined,
  });
  return unwrapList(data);
}

export async function getOrCreateCategory(name: string) {
  const { data } = await api.post<Category>("/catalog/categories/", { name });
  return data;
}

export async function deleteCategory(id: string) {
  await api.delete(`/catalog/categories/${id}/`);
}

export async function searchModels(categoryId: string, query: string) {
  const { data } = await api.get<Paginated<PhoneModel> | PhoneModel[]>("/catalog/models/", {
    params: { category: categoryId, ...(query ? { search: query } : {}) },
  });
  return unwrapList(data);
}

export async function listAllModels() {
  const { data } = await api.get<Paginated<PhoneModel> | PhoneModel[]>("/catalog/models/");
  return unwrapList(data);
}

export async function getOrCreateModel(categoryId: string, name: string) {
  const { data } = await api.post<PhoneModel>("/catalog/models/", { category: categoryId, name });
  return data;
}

export async function deleteModel(id: string) {
  await api.delete(`/catalog/models/${id}/`);
}
