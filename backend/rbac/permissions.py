from rest_framework.permissions import BasePermission


class IsAdminOrSuper(BasePermission):
    """
    Stricter than HasPermission: only a true superuser or a system role (e.g.
    "Admin") passes. No permission-codename fallback — a custom role that has
    manage_users/manage_roles ticked does NOT get through. Reserved for the
    Users & Roles admin surfaces, which must stay admin/super-only regardless
    of what any custom role is configured with.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return bool(user.is_superuser or (user.role and user.role.is_system_role))


class HasPermission(BasePermission):
    """
    Usage: add `required_permission = "add_stock"` (or a tuple for multiple, ANY-of)
    on the view, then set permission_classes = [HasPermission].
    Superusers and users with the system "Admin" role bypass checks.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser or (user.role and user.role.is_system_role):
            return True
        required = getattr(view, "required_permission", None)
        if required is None:
            return True  # view didn't declare a requirement -> falls back to IsAuthenticated
        if isinstance(required, str):
            required = (required,)
        if not user.role:
            return False
        user_perms = set(user.role.permissions.values_list("codename", flat=True))
        return any(p in user_perms for p in required)
