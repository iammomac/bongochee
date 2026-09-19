from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.captcha import verify_turnstile
from accounts.models import PasswordChangeRequest, User
from accounts.throttles import LoginRateThrottle
from rbac.models import Role
from rbac.permissions import HasPermission, IsAdminOrSuper


class FakePermissionManager:
    """Stand-in for the real ManyToManyField manager — HasPermission calls .values_list() on it."""

    def __init__(self, codenames):
        self._codenames = codenames

    def values_list(self, *args, **kwargs):
        return self._codenames


class HasPermissionTests(SimpleTestCase):
    def test_admin_bypasses_permission_checks(self):
        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True, is_superuser=False, role=SimpleNamespace(is_system_role=True, permissions=FakePermissionManager([])))
        )
        view = SimpleNamespace(required_permission="view_dashboard")

        self.assertTrue(HasPermission().has_permission(request, view))

    def test_user_role_permissions_are_enforced(self):
        request = SimpleNamespace(
            user=SimpleNamespace(
                is_authenticated=True,
                is_superuser=False,
                role=SimpleNamespace(is_system_role=False, permissions=FakePermissionManager(["view_dashboard"])),
            )
        )
        view = SimpleNamespace(required_permission="add_stock")

        self.assertFalse(HasPermission().has_permission(request, view))


class VerifyTurnstileTests(SimpleTestCase):
    @override_settings(TURNSTILE_SECRET_KEY="")
    def test_no_op_until_a_secret_key_is_configured(self):
        self.assertTrue(verify_turnstile(None, "1.2.3.4"))

    @override_settings(TURNSTILE_SECRET_KEY="test-secret")
    def test_rejects_a_missing_token_once_configured(self):
        self.assertFalse(verify_turnstile(None, "1.2.3.4"))

    @override_settings(TURNSTILE_SECRET_KEY="test-secret")
    def test_a_network_failure_fails_closed_instead_of_500ing(self):
        with patch("accounts.captcha.urllib.request.urlopen", side_effect=OSError("timed out")):
            self.assertFalse(verify_turnstile("some-token", "1.2.3.4"))

    @override_settings(TURNSTILE_SECRET_KEY="test-secret")
    def test_reads_cloudflares_success_field(self):
        response = MagicMock()
        response.read.return_value = b'{"success": true}'
        response.__enter__.return_value = response
        with patch("accounts.captcha.urllib.request.urlopen", return_value=response):
            self.assertTrue(verify_turnstile("some-token", "1.2.3.4"))


@override_settings(TURNSTILE_SECRET_KEY="")
class AuthFlowTests(APITestCase):
    def setUp(self):
        cache.clear()  # login is IP-throttled — start each test with a clean bucket
        self.role = Role.objects.create(name="Staff")
        self.user = User.objects.create_user(
            username="jdoe",
            password="Str0ngPassw0rd!",
            phone="255700000001",
            role=self.role,
            must_change_password=False,
        )

    def test_login_issues_real_jwt_and_authenticates_subsequent_request(self):
        res = self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "Str0ngPassw0rd!"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotEqual(self.client.cookies["access_token"].value, "dev-token")

        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.json()["username"], "jdoe")
        self.assertEqual(me.json()["role"]["name"], "Staff")

    @override_settings(TURNSTILE_SECRET_KEY="test-secret")
    def test_login_rejects_missing_captcha_once_turnstile_is_configured(self):
        res = self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "Str0ngPassw0rd!"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(TURNSTILE_SECRET_KEY="test-secret")
    def test_login_accepts_a_captcha_token_cloudflare_verifies(self):
        with patch("accounts.serializers.verify_turnstile", return_value=True) as mocked:
            res = self.client.post(
                "/api/v1/auth/login/",
                {"username": "jdoe", "password": "Str0ngPassw0rd!", "captchaToken": "a-real-looking-token"},
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mocked.assert_called_once()

    @override_settings(TURNSTILE_SECRET_KEY="test-secret")
    def test_login_rejects_a_captcha_token_cloudflare_does_not_verify(self):
        with patch("accounts.serializers.verify_turnstile", return_value=False):
            res = self.client.post(
                "/api/v1/auth/login/",
                {"username": "jdoe", "password": "Str0ngPassw0rd!", "captchaToken": "a-forged-token"},
            )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_failed_logins_lock_account_after_threshold(self):
        for _ in range(5):
            res = self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "wrong"})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.locked_until)

        res = self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "Str0ngPassw0rd!"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked", res.json()["detail"].lower())

    def test_refresh_rotates_and_blacklists_old_token(self):
        self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "Str0ngPassw0rd!"})
        old_refresh = self.client.cookies["refresh_token"].value

        res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        new_refresh = self.client.cookies["refresh_token"].value
        self.assertNotEqual(old_refresh, new_refresh)

        self.client.cookies["refresh_token"] = old_refresh
        res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self):
        self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "Str0ngPassw0rd!"})
        refresh_value = self.client.cookies["refresh_token"].value

        res = self.client.post("/api/v1/auth/logout/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.client.cookies["refresh_token"] = refresh_value
        res = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_only_allowed_while_forced(self):
        self.user.must_change_password = True
        self.user.save(update_fields=["must_change_password"])
        self.client.post("/api/v1/auth/login/", {"username": "jdoe", "password": "Str0ngPassw0rd!"})

        res = self.client.post("/api/v1/auth/change-password/", {"newPassword": "AnotherStr0ngOne!"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.json()["mustChangePassword"])

        res = self.client.post("/api/v1/auth/change-password/", {"newPassword": "YetAnotherOne!"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class PasswordChangeRequestPermissionTests(APITestCase):
    def setUp(self):
        self.role = Role.objects.create(name="Staff")
        self.user = User.objects.create_user(
            username="staffer",
            password="Str0ngPassw0rd!",
            phone="255700000002",
            role=self.role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.user)

    def test_user_can_create_own_request_but_not_list_or_approve(self):
        res = self.client.post("/api/v1/auth/password-requests/", {"reason": "forgot temp password"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()["user"]["username"], "staffer")

        res = self.client.get("/api/v1/auth/password-requests/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        req = PasswordChangeRequest.objects.first()
        res = self.client.post(f"/api/v1/auth/password-requests/{req.id}/approve/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_cannot_create_request_for_someone_else(self):
        other = User.objects.create_user(username="other", password="x", phone="255700000003")
        res = self.client.post("/api/v1/auth/password-requests/", {"user": str(other.id), "reason": "x"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PasswordChangeRequest.objects.first().user, self.user)


class LoginRateThrottleTests(SimpleTestCase):
    """Unit-level: exercises the throttle directly via RequestFactory rather than
    firing real HTTP requests through the login view — faster, deterministic, and
    isolated from the shared IP-keyed cache bucket other login tests also use.

    This throttle previously subclassed ScopedRateThrottle, whose allow_request()
    always re-derives self.scope from view.throttle_scope (never set anywhere in
    this codebase) — silently discarding the `scope` class attribute and making the
    login throttle a complete no-op. This test would have failed under that bug.
    """

    def setUp(self):
        cache.clear()

    def test_blocks_once_configured_rate_is_exceeded(self):
        throttle = LoginRateThrottle()
        factory = RequestFactory()

        def make_request():
            request = factory.post("/api/v1/auth/login/")
            request.user = AnonymousUser()
            return throttle.allow_request(request, view=None)

        allowed = [make_request() for _ in range(throttle.num_requests)]
        self.assertTrue(all(allowed), "every request within the configured rate should be allowed")
        self.assertFalse(make_request(), "the request beyond the configured rate should be blocked")


class IsAdminOrSuperTests(SimpleTestCase):
    def test_superuser_passes(self):
        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True, is_superuser=True, role=None))
        self.assertTrue(IsAdminOrSuper().has_permission(request, view=None))

    def test_system_role_passes(self):
        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True, is_superuser=False, role=SimpleNamespace(is_system_role=True))
        )
        self.assertTrue(IsAdminOrSuper().has_permission(request, view=None))

    def test_custom_role_with_matching_permission_codename_does_not_pass(self):
        # The whole point of IsAdminOrSuper vs HasPermission: no permission-codename
        # fallback, even if a custom role happens to hold manage_users/manage_roles.
        request = SimpleNamespace(
            user=SimpleNamespace(is_authenticated=True, is_superuser=False, role=SimpleNamespace(is_system_role=False))
        )
        self.assertFalse(IsAdminOrSuper().has_permission(request, view=None))

    def test_unauthenticated_does_not_pass(self):
        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=False))
        self.assertFalse(IsAdminOrSuper().has_permission(request, view=None))


class UserViewSetAdminTierTests(APITestCase):
    """Regression coverage for the two-tier admin work: IsAdminOrSuper gating,
    the super-admin edit guard, disabled hard-delete, and the password-hashing
    fix on update — all previously verified only by hand via curl."""

    def setUp(self):
        self.admin_role = Role.objects.create(name="Admin", is_system_role=True)
        self.system_admin = User.objects.create_user(
            username="sysadmin",
            password="Str0ngPassw0rd!",
            phone="255700000004",
            role=self.admin_role,
            must_change_password=False,
        )
        self.super_admin = User.objects.create_user(
            username="realsuper",
            password="Str0ngPassw0rd!",
            phone="255700000005",
            is_superuser=True,
            must_change_password=False,
        )
        self.custom_role = Role.objects.create(name="Custom")
        self.regular_user = User.objects.create_user(
            username="regular",
            password="Str0ngPassw0rd!",
            phone="255700000006",
            role=self.custom_role,
            must_change_password=False,
        )

    def test_custom_role_cannot_write_even_with_manage_users_permission(self):
        from rbac.models import Permission

        perm = Permission.objects.create(codename="manage_users", label="Manage Users", category="admin")
        self.custom_role.permissions.add(perm)
        self.client.force_authenticate(self.regular_user)

        res = self.client.post(
            "/api/v1/auth/users/",
            {"username": "sneaky", "phone": "255700000007", "password": "Str0ngPassw0rd!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_system_admin_cannot_edit_superuser_account(self):
        self.client.force_authenticate(self.system_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.super_admin.id}/", {"firstName": "Hacked"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_system_admin_can_edit_regular_user(self):
        self.client.force_authenticate(self.system_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.regular_user.id}/", {"firstName": "Edited"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_superuser_can_edit_own_account(self):
        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.super_admin.id}/", {"firstName": "SelfEdited"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_system_admin_can_reset_superuser_password_only(self):
        # The one deliberate exception to "only a super admin can modify this
        # account": a non-superuser admin may reset its password (and nothing
        # else) so a locked-out super admin can be helped back in.
        self.client.force_authenticate(self.system_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.super_admin.id}/", {"password": "BrandNewStr0ngPass!"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.check_password("BrandNewStr0ngPass!"))
        # Forced True: the admin who reset it never gets to know/control the
        # account's real password going forward.
        self.assertTrue(self.super_admin.must_change_password)

    def test_system_admin_cannot_smuggle_other_changes_alongside_password_reset(self):
        self.client.force_authenticate(self.system_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.super_admin.id}/",
            {"password": "BrandNewStr0ngPass!", "firstName": "Hacked"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.check_password("Str0ngPassw0rd!"))  # unchanged

    def _delete(self, user):
        return self.client.delete(f"/api/v1/auth/users/{user.id}/")

    def test_system_admin_can_delete_a_user(self):
        self.client.force_authenticate(self.system_admin)
        res = self._delete(self.regular_user)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.regular_user.id).exists())

    def test_superuser_can_delete_a_user(self):
        self.client.force_authenticate(self.super_admin)
        self.assertEqual(self._delete(self.regular_user).status_code, status.HTTP_204_NO_CONTENT)

    def test_a_custom_role_cannot_delete_even_with_manage_users(self):
        from rbac.models import Permission

        perm = Permission.objects.create(codename="manage_users", label="Manage Users", category="admin")
        self.custom_role.permissions.add(perm)
        other = User.objects.create_user(
            username="other", password="Str0ngPassw0rd!", phone="255700000008", must_change_password=False
        )
        self.client.force_authenticate(self.regular_user)
        self.assertEqual(self._delete(other).status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=other.id).exists())

    def test_nobody_can_delete_their_own_account(self):
        for actor in (self.system_admin, self.super_admin):
            self.client.force_authenticate(actor)
            self.assertEqual(self._delete(actor).status_code, status.HTTP_400_BAD_REQUEST)
            self.assertTrue(User.objects.filter(id=actor.id).exists())

    def test_the_super_admin_account_cannot_be_deleted_by_anyone(self):
        second_super = User.objects.create_user(
            username="super2", password="Str0ngPassw0rd!", phone="255700000009",
            is_superuser=True, must_change_password=False,
        )
        for actor in (self.system_admin, second_super):
            self.client.force_authenticate(actor)
            self.assertEqual(self._delete(self.super_admin).status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=self.super_admin.id).exists())

    def test_a_non_super_admin_cannot_delete_another_admin_but_super_can(self):
        other_admin = User.objects.create_user(
            username="admin2", password="Str0ngPassw0rd!", phone="255700000010",
            role=self.admin_role, must_change_password=False,
        )
        self.client.force_authenticate(self.system_admin)
        self.assertEqual(self._delete(other_admin).status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=other_admin.id).exists())

        self.client.force_authenticate(self.super_admin)
        self.assertEqual(self._delete(other_admin).status_code, status.HTTP_204_NO_CONTENT)

    def test_a_user_with_recorded_history_cannot_be_deleted(self):
        from sales.models import Sale

        Sale.objects.create(
            invoice_number="INV-HIST", customer_name="X", payment_method="cash", sold_by=self.regular_user
        )
        self.client.force_authenticate(self.super_admin)
        res = self._delete(self.regular_user)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("1 sales", res.json()["detail"])
        self.assertIn("Deactivate", res.json()["detail"])
        self.assertTrue(User.objects.filter(id=self.regular_user.id).exists())

    def test_deleting_a_user_cleans_up_their_password_requests_and_keeps_their_log_entries(self):
        from activitylog.models import ActivityLog

        PasswordChangeRequest.objects.create(user=self.regular_user, reason="forgot")
        ActivityLog.objects.create(user=self.regular_user, action="login.success")
        self.client.force_authenticate(self.super_admin)

        self.assertEqual(self._delete(self.regular_user).status_code, status.HTTP_204_NO_CONTENT)

        self.assertFalse(PasswordChangeRequest.objects.filter(reason="forgot").exists())
        # Their audit trail survives, just no longer attached to a user.
        self.assertTrue(ActivityLog.objects.filter(action="login.success", user__isnull=True).exists())
        # ...and the deletion itself is on record, naming who was removed.
        entry = ActivityLog.objects.get(action="user.delete")
        self.assertEqual(entry.user, self.super_admin)
        self.assertEqual(entry.details["username"], "regular")

    def test_password_submitted_on_update_is_hashed_not_stored_raw(self):
        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.regular_user.id}/", {"password": "BrandNewStr0ngPass!"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.regular_user.refresh_from_db()
        self.assertNotEqual(self.regular_user.password, "BrandNewStr0ngPass!")
        self.assertTrue(self.regular_user.check_password("BrandNewStr0ngPass!"))

    def test_update_without_password_leaves_existing_password_usable(self):
        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(
            f"/api/v1/auth/users/{self.regular_user.id}/", {"firstName": "NoPasswordChange"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.regular_user.refresh_from_db()
        self.assertTrue(self.regular_user.check_password("Str0ngPassw0rd!"))
