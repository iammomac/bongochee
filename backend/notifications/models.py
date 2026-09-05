import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    TYPE_CHOICES = [
        ("low_stock", "Low Stock"),
        ("out_of_stock", "Out of Stock"),
        ("password_request", "Password Request"),
        ("failed_login", "Failed Login"),
        ("new_return", "New Return"),
        ("system_alert", "System Alert"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=128)
    message = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)  # in-app path the frontend navigates to on click
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "is_read", "created_at"])]

    def __str__(self):
        return f"{self.notification_type} -> {self.recipient}"
