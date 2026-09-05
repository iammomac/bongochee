from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from activitylog.models import ActivityLog
from rbac.models import Permission, Role


class ActivityLogPermissionTests(APITestCase):
    def setUp(self):
        self.view_logs_perm = Permission.objects.create(codename="view_logs", label="View Logs", category="admin")
        self.other_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")

        holder_role = Role.objects.create(name="Auditor")
        holder_role.permissions.add(self.view_logs_perm)
        self.holder = User.objects.create_user(
            username="auditor", password="Str0ngPassw0rd!", phone="255700000020", role=holder_role, must_change_password=False
        )

        non_holder_role = Role.objects.create(name="Seller")
        non_holder_role.permissions.add(self.other_perm)
        self.non_holder = User.objects.create_user(
            username="seller1", password="Str0ngPassw0rd!", phone="255700000021", role=non_holder_role, must_change_password=False
        )

        ActivityLog.objects.create(user=self.holder, action="login", details={})

    def test_view_logs_holder_can_list(self):
        self.client.force_authenticate(self.holder)
        res = self.client.get("/api/v1/logs/logs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.json()["results"]), 1)

    def test_non_holder_is_denied(self):
        self.client.force_authenticate(self.non_holder)
        res = self.client.get("/api/v1/logs/logs/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ActivityLogDateRangeFilterTests(APITestCase):
    def setUp(self):
        perm = Permission.objects.create(codename="view_logs", label="View Logs", category="admin")
        role = Role.objects.create(name="Auditor")
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username="auditor2", password="Str0ngPassw0rd!", phone="255700000022", role=role, must_change_password=False
        )
        self.client.force_authenticate(self.user)

        recent = ActivityLog.objects.create(user=self.user, action="recent.action", details={})
        old = ActivityLog.objects.create(user=self.user, action="old.action", details={})
        # created_at is auto_now_add — backdate via .update() rather than the constructor,
        # which Django silently ignores for auto_now_add fields.
        ActivityLog.objects.filter(id=old.id).update(created_at=timezone.now() - timedelta(days=30))
        self.recent_id = recent.id
        self.old_id = old.id

    def test_date_from_excludes_older_entries(self):
        date_from = (timezone.now() - timedelta(days=7)).date().isoformat()
        res = self.client.get("/api/v1/logs/logs/", {"date_from": date_from})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.json()["results"]]
        self.assertIn(str(self.recent_id), ids)
        self.assertNotIn(str(self.old_id), ids)

    def test_date_to_excludes_newer_entries(self):
        date_to = (timezone.now() - timedelta(days=7)).date().isoformat()
        res = self.client.get("/api/v1/logs/logs/", {"date_to": date_to})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.json()["results"]]
        self.assertIn(str(self.old_id), ids)
        self.assertNotIn(str(self.recent_id), ids)

    def test_action_filter_is_exact_match(self):
        res = self.client.get("/api/v1/logs/logs/", {"action": "recent.action"})
        ids = [row["id"] for row in res.json()["results"]]
        self.assertEqual(ids, [str(self.recent_id)])
