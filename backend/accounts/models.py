import uuid

from django.contrib.auth.models import AbstractUser
from django.core.validators import FileExtensionValidator
from django.db import models

from config.validators import ALLOWED_IMAGE_EXTENSIONS, validate_image_size


class User(AbstractUser):
    """
    Custom user. Admin-managed password flow (no self-service password change):
    Admin sets a temp password -> must_change_password=True -> user forced to
    set a new one on next login.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, unique=True)
    email = models.EmailField(blank=True, null=True)
    photo = models.ImageField(
        upload_to="user_photos/",
        blank=True,
        null=True,
        validators=[validate_image_size, FileExtensionValidator(ALLOWED_IMAGE_EXTENSIONS)],
    )
    role = models.ForeignKey("rbac.Role", on_delete=models.PROTECT, related_name="users", null=True)
    is_active_employee = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=True)
    last_password_change = models.DateTimeField(null=True, blank=True)
    failed_login_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class PasswordChangeRequest(models.Model):
    """User -> Admin approval workflow for password resets (no self-service)."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_requests")
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_requests")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    temp_password_issued = models.BooleanField(default=False)

    class Meta:
        db_table = "password_change_requests"
        ordering = ["-requested_at"]
