import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { User } from "../types";

export async function listUsers() {
  const { data } = await api.get<Paginated<User> | User[]>("/auth/users/");
  return unwrapList(data);
}

export interface UserInput {
  username: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  role?: string | null;
  isActive?: boolean;
  isActiveEmployee?: boolean;
  password?: string;
}

export async function createUser(input: UserInput) {
  const { data } = await api.post<User>("/auth/users/", input);
  return data;
}

export async function updateUser(id: string, input: Partial<UserInput>) {
  const { data } = await api.patch<User>(`/auth/users/${id}/`, input);
  return data;
}
