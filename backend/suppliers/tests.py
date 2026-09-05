from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from rbac.models import Permission, Role
from suppliers.models import Supplier


class SupplierPermissionTests(APITestCase):
    def setUp(self):
        add_stock_perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        manage_suppliers_perm = Permission.objects.create(
            codename="manage_suppliers", label="Manage Suppliers", category="admin"
        )

        stocker_role = Role.objects.create(name="Stocker")
        stocker_role.permissions.add(add_stock_perm)
        self.stocker = User.objects.create_user(
            username="stocker2",
            password="Str0ngPassw0rd!",
            phone="255700000031",
            role=stocker_role,
            must_change_password=False,
        )

        manager_role = Role.objects.create(name="SupplierManager")
        manager_role.permissions.add(manage_suppliers_perm)
        self.manager = User.objects.create_user(
            username="manager2",
            password="Str0ngPassw0rd!",
            phone="255700000032",
            role=manager_role,
            must_change_password=False,
        )
        no_perm_role = Role.objects.create(name="NoPerms")
        self.outsider = User.objects.create_user(
            username="outsider1",
            password="Str0ngPassw0rd!",
            phone="255700000033",
            role=no_perm_role,
            must_change_password=False,
        )
        self.supplier = Supplier.objects.create(name="Blue Telecom")

    def test_add_stock_only_user_can_list_but_not_create(self):
        self.client.force_authenticate(self.stocker)
        res = self.client.get("/api/v1/suppliers/suppliers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        res = self.client.post("/api/v1/suppliers/suppliers/", {"name": "Nova Imports"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manage_suppliers_user_can_list_and_create(self):
        self.client.force_authenticate(self.manager)
        res = self.client.get("/api/v1/suppliers/suppliers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        res = self.client.post("/api/v1/suppliers/suppliers/", {"name": "Nova Imports"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_manage_suppliers_user_can_update_and_delete(self):
        self.client.force_authenticate(self.manager)
        res = self.client.patch(f"/api/v1/suppliers/suppliers/{self.supplier.id}/", {"phone": "255700099999"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["phone"], "255700099999")

        res = self.client.delete(f"/api/v1/suppliers/suppliers/{self.supplier.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Supplier.objects.filter(id=self.supplier.id).exists())

    def test_add_stock_only_user_cannot_update_or_delete(self):
        self.client.force_authenticate(self.stocker)
        res = self.client.patch(f"/api/v1/suppliers/suppliers/{self.supplier.id}/", {"phone": "255700099999"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res = self.client.delete(f"/api/v1/suppliers/suppliers/{self.supplier.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_without_any_relevant_permission_cannot_list(self):
        self.client.force_authenticate(self.outsider)
        res = self.client.get("/api/v1/suppliers/suppliers/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
