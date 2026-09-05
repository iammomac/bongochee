import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../types";

interface Props {
  requires?: PermissionCode | PermissionCode[];
  adminOnly?: boolean;
}

export function ProtectedRoute({ requires, adminOnly }: Props) {
  const { user, isLoading } = useAuth();
  const { has, isAdminOrSuper } = usePermissions();

  if (isLoading) return null; // could render a skeleton loader here
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/force-password-change" replace />;
  if (adminOnly && !isAdminOrSuper) return <Navigate to="/403" replace />;
  if (requires && !has(requires)) return <Navigate to="/403" replace />;

  return <Outlet />;
}
