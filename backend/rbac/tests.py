from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from activitylog.models import ActivityLog
from rbac.models import Permission, Role


class RoleAuditLoggingTests(APITestCase):
    def setUp(self):
        self.perm = Permission.objects.create(codename="manage_roles", label="Manage Roles", category="admin")
        self.admin_role = Role.objects.create(name="Admin", is_system_role=True)
        self.admin_role.permissions.add(self.perm)
        self.admin = User.objects.create_user(
            username="admin1",
            password="Str0ngPassw0rd!",
            phone="255700000010",
            role=self.admin_role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.admin)

    def test_role_create_update_delete_are_logged(self):
        res = self.client.post("/api/v1/rbac/roles/", {"name": "Cashier", "permissions": []})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        role_id = res.json()["id"]
        self.assertTrue(ActivityLog.objects.filter(action="role.create").exists())

        res = self.client.patch(f"/api/v1/rbac/roles/{role_id}/", {"description": "front desk"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(ActivityLog.objects.filter(action="role.update").exists())

        res = self.client.delete(f"/api/v1/rbac/roles/{role_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(ActivityLog.objects.filter(action="role.delete").exists())

    def test_system_role_cannot_be_deleted(self):
        res = self.client.delete(f"/api/v1/rbac/roles/{self.admin_role.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Role.objects.filter(id=self.admin_role.id).exists())


class RoleViewSetIsAdminOrSuperTests(APITestCase):
    """Roles & Permissions are admin/super-only end to end — a custom role holding
    manage_roles as a ticked permission must NOT get in, unlike the old HasPermission
    behavior this replaced."""

    def setUp(self):
        self.manage_roles_perm = Permission.objects.create(codename="manage_roles", label="Manage Roles", category="admin")
        self.custom_role = Role.objects.create(name="SneakyManager")
        self.custom_role.permissions.add(self.manage_roles_perm)
        self.user = User.objects.create_user(
            username="sneaky",
            password="Str0ngPassw0rd!",
            phone="255700000011",
            role=self.custom_role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.user)

    def test_custom_role_with_manage_roles_permission_is_denied(self):
        res = self.client.get("/api/v1/rbac/roles/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res = self.client.get("/api/v1/rbac/permissions/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res = self.client.post("/api/v1/rbac/roles/", {"name": "New", "permissions": []})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
