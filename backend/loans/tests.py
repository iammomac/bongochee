from datetime import date
from decimal import Decimal

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
