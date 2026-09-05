class PermissionAuditMiddleware:
    """
    Cross-cutting RBAC concern: logs every request denied by permission checks
    (HasPermission / IsAuthenticated, applied per-view) so repeated 403s are
    auditable without instrumenting each view individually.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code == 403:
            user = getattr(request, "user", None)
            if user is not None and user.is_authenticated:
                from activitylog.services import log_action
                from notifications.services import notify_permission_holders

                log_action(
                    user=user,
                    action="permission.denied",
                    request=request,
                    path=request.path,
                    method=request.method,
                )
                notify_permission_holders(
                    ["manage_users", "view_logs"],
                    "system_alert",
                    title="Permission denied",
                    message=f"{user.get_full_name() or user.username} was denied access to {request.method} {request.path}.",
                    link="/logs",
                    exclude_user=user,
                )
        return response
