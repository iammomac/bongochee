import uuid

from django.conf import settings
from django.db import models


class ActivityLog(models.Model):
    """Immutable audit trail. Only Admin can view; no update/delete exposed via API."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="activity_logs")
    action = models.CharField(max_length=64)  # e.g. "login", "sale.create", "stock.import", "role.update"
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "activity_logs"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["action", "created_at"]), models.Index(fields=["user", "created_at"])]

    def save(self, *args, **kwargs):
        # `id` is a client-side UUID default, so `self.pk` is already set even on a
        # brand-new unsaved instance — `self._state.adding` is the correct signal for
        # "this is the first save" regardless of how the pk was generated.
        if not self._state.adding:
            raise ValueError("Activity logs are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Activity logs are immutable and cannot be deleted.")
