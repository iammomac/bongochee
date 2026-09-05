from .models import ActivityLog


def log_action(*, user, action, request=None, **details):
    """Single entry point for writing audit log rows. Call this from views/signals,
    e.g. log_action(user=request.user, action="sale.create", request=request, invoice=sale.invoice_number)."""
    ActivityLog.objects.create(
        user=user,
        action=action,
        details=details,
        ip_address=getattr(request, "client_ip", None) if request else None,
    )
