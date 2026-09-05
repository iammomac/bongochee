from datetime import date

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from notifications.models import Notification
from notifications.services import notify_permission_holders
from rbac.models import Permission, Role
from returns_app.models import Return
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier


class NotifyPermissionHoldersTests(APITestCase):
    def setUp(self):
        self.perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        self.other_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")

        holder_role = Role.objects.create(name="Stock Manager")
        holder_role.permissions.add(self.perm)
        self.holder = User.objects.create_user(
            username="holder", password="Str0ngPassw0rd!", phone="255700000070", role=holder_role, must_change_password=False
        )

        non_holder_role = Role.objects.create(name="Seller")
        non_holder_role.permissions.add(self.other_perm)
        self.non_holder = User.objects.create_user(
            username="nonholder", password="Str0ngPassw0rd!", phone="255700000071", role=non_holder_role, must_change_password=False
        )

        system_role = Role.objects.create(name="Admin", is_system_role=True)
        self.system_user = User.objects.create_user(
            username="sysadmin", password="Str0ngPassw0rd!", phone="255700000072", role=system_role, must_change_password=False
        )

        self.superuser = User.objects.create_user(
            username="root", password="Str0ngPassw0rd!", phone="255700000073", must_change_password=False, is_superuser=True
        )

    def test_fans_out_to_superuser_system_role_and_permission_holders_but_not_others(self):
        notify_permission_holders("add_stock", "system_alert", title="Test alert")
        recipients = set(Notification.objects.values_list("recipient__username", flat=True))
        self.assertEqual(recipients, {"holder", "sysadmin", "root"})

    def test_exclude_user_is_respected(self):
        notify_permission_holders("add_stock", "system_alert", title="Test alert", exclude_user=self.holder)
        recipients = set(Notification.objects.values_list("recipient__username", flat=True))
        self.assertEqual(recipients, {"sysadmin", "root"})


class SaleStockNotificationTests(APITestCase):
    def setUp(self):
        stock_perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        sales_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")

        manager_role = Role.objects.create(name="Stock Manager")
        manager_role.permissions.add(stock_perm)
        self.manager = User.objects.create_user(
            username="manager", password="Str0ngPassw0rd!", phone="255700000080", role=manager_role, must_change_password=False
        )

        seller_role = Role.objects.create(name="Seller")
        seller_role.permissions.add(sales_perm)
        self.seller = User.objects.create_user(
            username="seller", password="Str0ngPassw0rd!", phone="255700000081", role=seller_role, must_change_password=False
        )
        self.client.force_authenticate(self.seller)

        self.supplier = Supplier.objects.create(name="Blue Telecom")
        self.category = Category.objects.create(name="Samsung")
        self.model = PhoneModel.objects.create(category=self.category, name="Galaxy A56")
        self.stock_in = StockIn.objects.create(supplier=self.supplier, import_date=date.today(), created_by=self.seller)

    def _stock_item(self, quantity_remaining):
        return StockItem.objects.create(
            stock_in=self.stock_in,
            category=self.category,
            model=self.model,
            quantity=quantity_remaining,
            quantity_remaining=quantity_remaining,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )

    def _sell(self, stock_item, imei, invoice):
        return self.client.post(
            "/api/v1/sales/sales/",
            {
                "invoiceNumber": invoice,
                "customerName": "Walk-in",
                "paymentMethod": "cash",
                "items": [{"stockItem": str(stock_item.id), "imei": imei, "sellingPrice": "650000"}],
            },
            format="json",
        )

    def test_crossing_low_stock_threshold_fires_exactly_once(self):
        stock_item = self._stock_item(6)  # LOW_STOCK_THRESHOLD is 5 — this sale crosses 6 -> 5
        res = self._sell(stock_item, "111111111111111", "INV-LOW-1")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(notification_type="low_stock", recipient=self.manager).count(), 1)

    def test_sale_on_already_low_batch_does_not_refire(self):
        stock_item = self._stock_item(3)  # already below threshold, no crossing occurs
        res = self._sell(stock_item, "222222222222222", "INV-LOW-2")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(notification_type="low_stock").count(), 0)

    def test_emptying_batch_fires_out_of_stock_not_low_stock(self):
        stock_item = self._stock_item(1)
        res = self._sell(stock_item, "333333333333333", "INV-OUT-1")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(notification_type="out_of_stock", recipient=self.manager).count(), 1)
        self.assertEqual(Notification.objects.filter(notification_type="low_stock").count(), 0)


class EventNotificationTests(APITestCase):
    def setUp(self):
        cache.clear()  # login is IP-throttled — start with a clean bucket
        manage_perm = Permission.objects.create(codename="manage_users", label="Manage Users", category="admin")
        logs_perm = Permission.objects.create(codename="view_logs", label="View Logs", category="admin")
        returns_perm = Permission.objects.create(codename="create_returns", label="Create Returns", category="returns")

        admin_role = Role.objects.create(name="Admin")
        admin_role.permissions.add(manage_perm, logs_perm)
        self.admin = User.objects.create_user(
            username="admin1", password="Str0ngPassw0rd!", phone="255700000090", role=admin_role, must_change_password=False
        )

        support_role = Role.objects.create(name="Support")
        support_role.permissions.add(returns_perm)
        self.support = User.objects.create_user(
            username="support1", password="Str0ngPassw0rd!", phone="255700000091", role=support_role, must_change_password=False
        )

    def test_failed_login_notifies_manage_users_and_view_logs_holders(self):
        User.objects.create_user(
            username="realuser", password="Str0ngPassw0rd!", phone="255700000092", must_change_password=False
        )
        res = self.client.post("/api/v1/auth/login/", {"username": "realuser", "password": "wrongpassword"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            Notification.objects.filter(notification_type="failed_login", recipient=self.admin).count(), 1
        )

    def test_password_request_notifies_manage_users_holders_not_requester(self):
        self.client.force_authenticate(self.support)
        res = self.client.post("/api/v1/auth/password-requests/", {"reason": "Forgot it"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            Notification.objects.filter(notification_type="password_request", recipient=self.admin).count(), 1
        )
        self.assertEqual(
            Notification.objects.filter(notification_type="password_request", recipient=self.support).count(), 0
        )

    def test_new_return_notifies_holders_excluding_filer(self):
        self.client.force_authenticate(self.support)
        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.support)
        stock_item = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=5,
            quantity_remaining=4,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )
        sale = Sale.objects.create(
            invoice_number="INV-RET-NOTIF", customer_name="Amina Yusuf", payment_method="cash", sold_by=self.support
        )
        sale_item = SaleItem.objects.create(sale=sale, stock_item=stock_item, imei="444444444444444", selling_price="650000")

        res = self.client.post(
            "/api/v1/returns/returns/",
            {
                "saleItem": str(sale_item.id),
                "returnDate": str(date.today()),
                "returnCategory": "battery",
                "description": "Battery drains fast",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(notification_type="new_return", recipient=self.admin).count(), 1)
        self.assertEqual(Notification.objects.filter(notification_type="new_return", recipient=self.support).count(), 0)
        notification = Notification.objects.get(notification_type="new_return", recipient=self.admin)
        self.assertIn("444444444444444", notification.message)


class NotificationViewSetTests(APITestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(
            username="usera", password="Str0ngPassw0rd!", phone="255700000095", must_change_password=False
        )
        self.user_b = User.objects.create_user(
            username="userb", password="Str0ngPassw0rd!", phone="255700000096", must_change_password=False
        )
        self.notif_a = Notification.objects.create(recipient=self.user_a, notification_type="system_alert", title="A's alert")
        self.notif_b = Notification.objects.create(recipient=self.user_b, notification_type="system_alert", title="B's alert")

    def test_list_only_returns_own_notifications(self):
        self.client.force_authenticate(self.user_a)
        res = self.client.get("/api/v1/notifications/notifications/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.json()["results"]] if "results" in res.json() else [row["id"] for row in res.json()]
        self.assertEqual(ids, [str(self.notif_a.id)])

    def test_mark_read_cannot_touch_other_users_notification(self):
        self.client.force_authenticate(self.user_a)
        res = self.client.post(f"/api/v1/notifications/notifications/{self.notif_b.id}/mark-read/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.notif_b.refresh_from_db()
        self.assertFalse(self.notif_b.is_read)

    def test_mark_all_read_only_updates_own_notifications(self):
        Notification.objects.create(recipient=self.user_a, notification_type="system_alert", title="Second for A")
        self.client.force_authenticate(self.user_a)
        res = self.client.post("/api/v1/notifications/notifications/mark-all-read/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["updated"], 2)
        self.notif_b.refresh_from_db()
        self.assertFalse(self.notif_b.is_read)
