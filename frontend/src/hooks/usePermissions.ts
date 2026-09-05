import { useAuth } from "./useAuth";
import type { PermissionCode } from "../types";

export function usePermissions() {
  const { user } = useAuth();

  const has = (code: PermissionCode | PermissionCode[]): boolean => {
    if (!user) return false;
    if (user.isSuperuser || user.role?.isSystemRole) return true;
    if (!user.role) return false;
    const required = Array.isArray(code) ? code : [code];
    return required.some((c) => user.role!.permissions.includes(c));
  };

  // Stricter than has(): only a true superuser or a system role (e.g. "Admin")
  // qualifies — no custom role, however permissioned, counts. Mirrors the backend's
  // IsAdminOrSuper, used to gate the Users & Roles admin surfaces specifically.
  const isAdminOrSuper = Boolean(user && (user.isSuperuser || user.role?.isSystemRole));

  return { has, isAdminOrSuper };
}
