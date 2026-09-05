import gzip
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category
from rbac.models import Role


class SystemBackupViewTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(name="Admin", is_system_role=True)
        self.plain_role = Role.objects.create(name="Cashier")
        self.admin_user = User.objects.create_user(
            username="admin", password="Str0ngPassw0rd!", phone="255700000010",
            role=self.admin_role, must_change_password=False,
        )
        self.plain_user = User.objects.create_user(
            username="cashier", password="Str0ngPassw0rd!", phone="255700000011",
            role=self.plain_role, must_change_password=False,
        )

    def test_non_admin_cannot_download_backup(self):
        self.client.force_authenticate(self.plain_user)
        res = self.client.get("/api/v1/system/backup/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_download_backup_containing_current_data(self):
        Category.objects.create(name="Samsung")
        self.client.force_authenticate(self.admin_user)
        res = self.client.get("/api/v1/system/backup/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/gzip")
        payload = json.loads(gzip.decompress(res.content))
        models_in_dump = {row["model"] for row in payload}
        self.assertIn("catalog.category", models_in_dump)
        # Framework-managed tables never belong in a portable backup.
        self.assertNotIn("contenttypes.contenttype", models_in_dump)
        self.assertNotIn("token_blacklist.outstandingtoken", models_in_dump)


class SystemRestoreViewTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(name="Admin", is_system_role=True)
        self.super_user = User.objects.create_superuser(
            username="super", password="Str0ngPassw0rd!", phone="255700000012",
        )
        self.system_admin = User.objects.create_user(
            username="sysadmin", password="Str0ngPassw0rd!", phone="255700000013",
            role=self.admin_role, must_change_password=False,
        )

    def _upload(self, payload):
        return SimpleUploadedFile(
            "backup.json.gz",
            gzip.compress(json.dumps(payload).encode("utf-8")),
            content_type="application/gzip",
        )

    def test_system_role_admin_cannot_restore_only_true_superuser_can(self):
        self.client.force_authenticate(self.system_admin)
        res = self.client.post(
            "/api/v1/system/restore/",
            {"password": "Str0ngPassw0rd!", "file": self._upload([])},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_restore_rejects_wrong_password(self):
        self.client.force_authenticate(self.super_user)
        res = self.client.post(
            "/api/v1/system/restore/",
            {"password": "wrong-password", "file": self._upload([])},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_restore_rejects_non_gzip_file(self):
        self.client.force_authenticate(self.super_user)
        bad_file = SimpleUploadedFile("backup.json.gz", b"not actually gzip", content_type="application/gzip")
        res = self.client.post(
            "/api/v1/system/restore/",
            {"password": "Str0ngPassw0rd!", "file": bad_file},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_restore_merges_instead_of_wiping(self):
        untouched = Category.objects.create(name="Untouched Brand")
        restorable = Category.objects.create(name="Original Name")

        backup_payload = [
            {
                "model": "catalog.category",
                "pk": str(restorable.pk),
                "fields": {"name": "Original Name", "created_at": restorable.created_at.isoformat()},
            },
        ]

        # Simulate drift since the backup was taken.
        restorable.name = "Edited After Backup"
        restorable.save(update_fields=["name"])
        newer = Category.objects.create(name="Added After Backup")

        self.client.force_authenticate(self.super_user)
        res = self.client.post(
            "/api/v1/system/restore/",
            {"password": "Str0ngPassw0rd!", "file": self._upload(backup_payload)},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        restorable.refresh_from_db()
        self.assertEqual(restorable.name, "Original Name")  # reverted to the backup's version
        self.assertTrue(Category.objects.filter(pk=untouched.pk).exists())  # left alone
        self.assertTrue(Category.objects.filter(pk=newer.pk).exists())  # left alone, not deleted

    def test_restore_failure_rolls_back_cleanly(self):
        untouched = Category.objects.create(name="Should Survive")
        malformed_payload = [{"model": "catalog.category", "pk": "not-a-uuid", "fields": {"name": "x"}}]

        self.client.force_authenticate(self.super_user)
        res = self.client.post(
            "/api/v1/system/restore/",
            {"password": "Str0ngPassw0rd!", "file": self._upload(malformed_payload)},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertTrue(Category.objects.filter(pk=untouched.pk).exists())
