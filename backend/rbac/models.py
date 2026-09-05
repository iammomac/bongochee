import uuid

from django.db import models


class Permission(models.Model):
    """Fixed catalog of permission codes the system checks against."""

    codename = models.CharField(max_length=64, unique=True)  # e.g. "view_dashboard", "add_stock"
    label = models.CharField(max_length=128)
    category = models.CharField(max_length=64, blank=True)  # groups perms in the Role editor UI

    class Meta:
        db_table = "permissions"
        ordering = ["category", "codename"]

    def __str__(self):
        return self.codename


class Role(models.Model):
    """Admin-defined, fully dynamic role (create/edit/delete)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, related_name="roles", blank=True)
    is_system_role = models.BooleanField(default=False)  # e.g. "Admin" — cannot be deleted
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "roles"

    def __str__(self):
        return self.name
