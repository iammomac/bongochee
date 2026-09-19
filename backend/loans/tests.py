from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from loans.models import LoanSale, LoanSaleItem
from rbac.models import Permission, Role
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier


class LoanSaleTests(APITestCase):
    def setUp(self):
        create_perm = Permission.objects.create(codename="create_loan_sales", label="Create Loan Sales", category="loans")
        edit_perm = Permission.objects.create(codename="edit_loan_sales", label="Edit Loan Sales", category="loans")
        delete_perm = Permission.objects.create(codename="delete_loan_sales", label="Delete Loan Sales", category="loans")
        payment_perm = Permission.objects.create(
            codename="record_loan_payments", label="Record Loan Payments", category="loans"
        )

        sales_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")

        dealer_role = Role.objects.create(name="Loan Dealer")
        dealer_role.permissions.add(create_perm, edit_perm, delete_perm, payment_perm, sales_perm)
        self.dealer = User.objects.create_user(
            username="dealer",
            password="Str0ngPassw0rd!",
            phone="255700000050",
            role=dealer_role,
            must_change_password=False,
        )

        cashier_role = Role.objects.create(name="Cashier")
        cashier_role.permissions.add(payment_perm)
        self.cashier = User.objects.create_user(
            username="cashier",
            password="Str0ngPassw0rd!",
            phone="255700000051",
            role=cashier_role,
            must_change_password=False,
        )

        no_perms_role = Role.objects.create(name="Nobody")
        self.outsider = User.objects.create_user(
            username="outsider",
            password="Str0ngPassw0rd!",
            phone="255700000052",
            role=no_perms_role,
            must_change_password=False,
        )

        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.dealer)
        self.stock_item = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=3,
            quantity_remaining=3,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )
        self.client.force_authenticate(self.dealer)

    def _loan_payload(self, items, **overrides):
        payload = {
            "invoiceNumber": "LOAN-1",
            "businessName": "Kariakoo Phones Ltd",
            "contactPerson": "Juma",
            "contactPhone": "255711111111",
            "items": items,
        }
        payload.update(overrides)
        return payload

    def _create_loan(self, imei="111111111111111", selling_price="650000"):
        res = self.client.post(
            "/api/v1/loans/loan-sales/",
            self._loan_payload([{"stockItem": str(self.stock_item.id), "imei": imei, "sellingPrice": selling_price}]),
            format="json",
        )
        return res

    def test_only_create_loan_sales_permission_can_create(self):
        self.client.force_authenticate(self.outsider)
        res = self._create_loan()
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_creating_a_loan_sale_decrements_stock(self):
        res = self._create_loan()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.stock_item.refresh_from_db()
        self.assertEqual(self.stock_item.quantity_remaining, 2)
        self.assertEqual(res.data["loan_status"], "open")
        self.assertEqual(res.data["total_owed"], Decimal("650000.00"))
        self.assertEqual(res.data["balance"], Decimal("650000.00"))

    def test_imei_already_sold_normally_is_rejected_on_a_loan(self):
        Sale.objects.create(invoice_number="INV-X", customer_name="X", payment_method="cash", sold_by=self.dealer)
        SaleItem.objects.create(
            sale=Sale.objects.get(invoice_number="INV-X"),
            stock_item=self.stock_item,
            imei="222222222222222",
            selling_price="650000",
        )
        res = self._create_loan(imei="222222222222222")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_imei_already_loaned_is_rejected_on_a_normal_sale(self):
        loan_res = self._create_loan(imei="333333333333333")
        self.assertEqual(loan_res.status_code, status.HTTP_201_CREATED)
        res = self.client.post(
            "/api/v1/sales/sales/",
            {
                "invoiceNumber": "INV-Y",
                "customerName": "Walk-in",
                "paymentMethod": "cash",
                "items": [{"stockItem": str(self.stock_item.id), "imei": "333333333333333", "sellingPrice": "650000"}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_recording_payments_updates_balance_and_status(self):
        res = self._create_loan()
        loan_id = res.data["id"]

        res = self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "200000", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["loan_status"], "partial")
        self.assertEqual(res.data["total_paid"], Decimal("200000.00"))
        self.assertEqual(res.data["balance"], Decimal("450000.00"))

        res = self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "450000", "paymentMethod": "mobile_money", "paidDate": str(date.today())},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["loan_status"], "paid")
        self.assertEqual(res.data["balance"], Decimal("0.00"))

    def test_zero_or_negative_payment_is_rejected(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        res = self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "0", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_recording_a_payment_requires_permission(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        self.client.force_authenticate(self.outsider)
        res = self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "1000", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_can_record_payments_without_full_edit_rights(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        self.client.force_authenticate(self.cashier)
        res = self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "1000", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.patch(f"/api/v1/loans/loan-sales/{loan_id}/", {"notes": "hi"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_removing_a_payment_recomputes_the_balance(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        res = self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "200000", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )
        payment_id = res.data["payments"][0]["id"]

        res = self.client.delete(f"/api/v1/loans/loan-sales/{loan_id}/payments/{payment_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_paid"], Decimal("0.00"))
        self.assertEqual(res.data["loan_status"], "open")

    def test_deleting_a_loan_with_no_payments_restores_stock(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        self.stock_item.refresh_from_db()
        self.assertEqual(self.stock_item.quantity_remaining, 2)

        res = self.client.delete(f"/api/v1/loans/loan-sales/{loan_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.stock_item.refresh_from_db()
        self.assertEqual(self.stock_item.quantity_remaining, 3)
        self.assertFalse(LoanSaleItem.objects.filter(loan_sale_id=loan_id).exists())

    def test_deleting_a_loan_with_payments_is_blocked(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "1000", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )
        res = self.client.delete(f"/api/v1/loans/loan-sales/{loan_id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(LoanSale.objects.filter(id=loan_id).exists())

    def test_editing_item_price_is_blocked_once_a_payment_exists(self):
        res = self._create_loan()
        loan_id = res.data["id"]
        item_id = res.data["items"][0]["id"]
        self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": "1000", "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )

        res = self.client.patch(
            f"/api/v1/loans/loan-sales/{loan_id}/",
            {"items": [{"id": item_id, "sellingPrice": "700000"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Header fields are still editable.
        res = self.client.patch(
            f"/api/v1/loans/loan-sales/{loan_id}/", {"businessName": "Renamed Ltd"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["business_name"], "Renamed Ltd")


class LoanChartTests(APITestCase):
    """The summary endpoint behind the loan charts, and the per-loan revenue/profit
    fields shown on the details screen."""

    def setUp(self):
        codes = ("create_loan_sales", "record_loan_payments", "view_profit")
        perms = {c: Permission.objects.create(codename=c, label=c, category="loans") for c in codes}

        role = Role.objects.create(name="Loan Dealer")
        role.permissions.add(perms["create_loan_sales"], perms["record_loan_payments"])
        self.dealer = User.objects.create_user(
            username="dealer", password="Str0ngPassw0rd!", phone="255700000060", role=role, must_change_password=False
        )

        profit_role = Role.objects.create(name="Loan Owner")
        profit_role.permissions.add(perms["create_loan_sales"], perms["record_loan_payments"], perms["view_profit"])
        self.owner = User.objects.create_user(
            username="owner", password="Str0ngPassw0rd!", phone="255700000061", role=profit_role, must_change_password=False
        )

        self.outsider = User.objects.create_user(
            username="outsider", password="Str0ngPassw0rd!", phone="255700000062",
            role=Role.objects.create(name="Nobody"), must_change_password=False,
        )

        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        stock_in = StockIn.objects.create(
            supplier=Supplier.objects.create(name="Blue Telecom"), import_date=date.today(), created_by=self.dealer
        )
        self.stock_item = StockItem.objects.create(
            stock_in=stock_in, category=category, model=model, quantity=10, quantity_remaining=10,
            buying_price="500000", min_selling_price="600000", max_selling_price="700000",
        )
        self.client.force_authenticate(self.owner)

    def _loan(self, invoice, *prices, discount="0"):
        items = [
            {"stockItem": str(self.stock_item.id), "imei": "", "sellingPrice": price, "discount": discount}
            for price in prices
        ]
        res = self.client.post(
            "/api/v1/loans/loan-sales/",
            {"invoiceNumber": invoice, "businessName": "Kariakoo Phones Ltd", "items": items},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res

    def _pay(self, loan_id, amount):
        return self.client.post(
            f"/api/v1/loans/loan-sales/{loan_id}/payments/",
            {"amount": amount, "paymentMethod": "cash", "paidDate": str(date.today())},
            format="json",
        )

    def test_a_loan_shows_its_revenue_cost_and_expected_profit(self):
        res = self._loan("L-1", "650000", "620000", discount="20000")
        # revenue = (650000-20000) + (620000-20000); cost = 2 x 500000
        self.assertEqual(res.data["revenue"], Decimal("1230000"))
        self.assertEqual(res.data["cost"], Decimal("1000000"))
        self.assertEqual(res.data["expected_profit"], Decimal("230000"))

    def test_cost_and_profit_are_hidden_without_view_profit(self):
        loan_id = self._loan("L-1", "650000").data["id"]
        self.client.force_authenticate(self.dealer)  # no view_profit
        listed = self.client.get("/api/v1/loans/loan-sales/").json()
        row = (listed["results"] if isinstance(listed, dict) else listed)[0]
        self.assertEqual(row["revenue"], 650000)
        self.assertNotIn("cost", row)
        self.assertNotIn("expectedProfit", row)
        # ...including in the response to recording a payment.
        paid = self._pay(loan_id, "1000")
        self.assertNotIn("expected_profit", paid.data)
        self.assertIn("revenue", paid.data)

    def test_summary_requires_a_loan_permission(self):
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get("/api/v1/loans/loan-sales/summary/").status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_trend_is_zero_filled_and_totals_today(self):
        self._loan("L-1", "650000")
        self._loan("L-2", "700000", "700000")
        body = self.client.get("/api/v1/loans/loan-sales/summary/", {"days": 7}).json()
        self.assertEqual(len(body["trend"]), 7)
        self.assertEqual([p["date"] for p in body["trend"]], sorted(p["date"] for p in body["trend"]))
        today = body["trend"][-1]
        self.assertEqual(today["loans"], 2)
        self.assertEqual(today["units"], 3)
        self.assertEqual(float(today["revenue"]), 2050000.0)
        self.assertEqual(float(today["expectedProfit"]), 550000.0)  # 2050000 - 3 x 500000
        self.assertEqual(body["trend"][0]["loans"], 0)
        self.assertEqual(body["totals"]["loans"], 2)
        self.assertEqual(float(body["totals"]["revenue"]), 2050000.0)

    def test_summary_hides_expected_profit_without_view_profit(self):
        self._loan("L-1", "650000")
        self.client.force_authenticate(self.dealer)
        body = self.client.get("/api/v1/loans/loan-sales/summary/").json()
        self.assertNotIn("expectedProfit", body["totals"])
        self.assertTrue(all("expectedProfit" not in point for point in body["trend"]))
        self.assertIn("revenue", body["totals"])

    def test_receivables_split_paid_from_owed_across_the_whole_book(self):
        partial = self._loan("L-1", "600000").data["id"]
        cleared = self._loan("L-2", "400000").data["id"]
        self._loan("L-3", "300000")  # untouched
        self._pay(partial, "150000")
        self._pay(cleared, "400000")
        # An old loan sits outside the chart window but is still part of the book.
        old = self._loan("L-4", "100000").data["id"]
        LoanSale.objects.filter(id=old).update(created_at=timezone.now() - timedelta(days=60))

        body = self.client.get("/api/v1/loans/loan-sales/summary/", {"days": 14}).json()
        rec = body["receivables"]
        self.assertEqual(float(rec["total"]), 1400000.0)
        self.assertEqual(float(rec["paid"]), 550000.0)
        self.assertEqual(float(rec["owed"]), 850000.0)  # 450000 + 0 + 300000 + 100000
        self.assertEqual((rec["loansOpen"], rec["loansPartial"], rec["loansPaid"]), (2, 1, 1))
        # ...but the old loan isn't in the per-day window.
        self.assertEqual(body["totals"]["loans"], 3)

    def test_an_overpaid_loan_does_not_cancel_another_loans_debt(self):
        overpaid = self._loan("L-1", "100000").data["id"]
        self._loan("L-2", "200000")
        self._pay(overpaid, "150000")
        rec = self.client.get("/api/v1/loans/loan-sales/summary/").json()["receivables"]
        self.assertEqual(float(rec["owed"]), 200000.0)

    def test_days_is_clamped_and_bad_input_falls_back(self):
        self.assertEqual(len(self.client.get("/api/v1/loans/loan-sales/summary/", {"days": 99999}).json()["trend"]), 365)
        self.assertEqual(len(self.client.get("/api/v1/loans/loan-sales/summary/", {"days": 0}).json()["trend"]), 1)
        self.assertEqual(len(self.client.get("/api/v1/loans/loan-sales/summary/", {"days": "abc"}).json()["trend"]), 14)
