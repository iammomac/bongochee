import { api } from "./api";
import { unwrapList, type Paginated } from "../lib/pagination";
import type { Permission } from "../types";

// RoleViewSet's own serializer represents `permissions` as Permission PKs (numbers),
// unlike the codename-string shape embedded in User.role via RoleSummarySerializer —
// this type reflects the actual management-list shape, not the embedded-summary one.
export interface RoleWithPermissionIds {
  id: string;
  name: string;
  description: string;
  permissions: number[];
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listRoles() {
  const { data } = await api.get<Paginated<RoleWithPermissionIds> | RoleWithPermissionIds[]>("/rbac/roles/");
  return unwrapList(data);
}

export async function listPermissions() {
  const { data } = await api.get<Paginated<Permission> | Permission[]>("/rbac/permissions/");
  return unwrapList(data);
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: number[];
}

export async function createRole(input: RoleInput) {
  const { data } = await api.post<RoleWithPermissionIds>("/rbac/roles/", input);
  return data;
}

export async function updateRole(id: string, input: RoleInput) {
  const { data } = await api.patch<RoleWithPermissionIds>(`/rbac/roles/${id}/`, input);
  return data;
}

export async function deleteRole(id: string) {
  await api.delete(`/rbac/roles/${id}/`);
}
