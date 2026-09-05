from rest_framework import serializers

from rbac.models import Permission, Role


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ("id", "codename", "label", "category")
        read_only_fields = ("id",)


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(queryset=Permission.objects.all(), many=True, required=False)

    class Meta:
        model = Role
        fields = ("id", "name", "description", "permissions", "is_system_role", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class RoleSummarySerializer(serializers.ModelSerializer):
    """Read-only role shape for embedding inside other payloads (e.g. UserSerializer.role) —
    permissions as codename strings, matching the frontend's Role type, not PKs."""

    permissions = serializers.SlugRelatedField(slug_field="codename", many=True, read_only=True)

    class Meta:
        model = Role
        fields = ("id", "name", "description", "permissions", "is_system_role", "created_at", "updated_at")
        read_only_fields = fields
