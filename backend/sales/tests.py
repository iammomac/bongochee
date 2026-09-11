from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from rbac.models import Permission, Role
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier


class SaleTests(APITestCase):
    def setUp(self):
        create_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")
        delete_perm = Permission.objects.create(codename="delete_sales", label="Delete Sales", category="sales")

        seller_role = Role.objects.create(name="Seller")
        seller_role.permissions.add(create_perm)
        self.seller = User.objects.create_user(
            username="seller",
            password="Str0ngPassw0rd!",
            phone="255700000040",
            role=seller_role,
            must_change_password=False,
        )

        supervisor_role = Role.objects.create(name="Supervisor")
        supervisor_role.permissions.add(create_perm, delete_perm)
        self.supervisor = User.objects.create_user(
            username="supervisor",
            password="Str0ngPassw0rd!",
            phone="255700000041",
            role=supervisor_role,
            must_change_password=False,
        )

        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.seller)
        self.stock_item = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=2,
            quantity_remaining=2,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )
        self.client.force_authenticate(self.seller)

    def _sale_payload(self, items):
        return {
            "invoiceNumber": "INV-SALE-1",
            "customerName": "Walk-in",
            "paymentMethod": "cash",
            "items": items,
        }

    def test_bargained_price_with_discount_is_accepted_above_floor(self):
        # Sold price is a free-form (bargained) figure; discount is subtracted from it
        # to get the net amount actually received, which just needs to clear the floor.
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [
                    {
                        "stockItem": str(self.stock_item.id),
                        "imei": "111111111111111",
                        "sellingPrice": "699999",
                        "discount": "20000",
                    }
                ]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        item = SaleItem.objects.get(imei="111111111111111")
        self.assertEqual(str(item.selling_price), "699999.00")
        self.assertEqual(str(item.discount), "20000.00")

    def test_net_price_below_minimum_after_discount_is_allowed(self):
        # min_selling_price is 600000 — a 650000 sold price with a 100000 discount
        # nets to 550000, below the floor. This is a soft warning in the UI, not a
        # hard block server-side: the sale goes through and shows up on the Loss
        # Report afterward (see reports/tests.py) instead of being rejected outright.
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [
                    {
                        "stockItem": str(self.stock_item.id),
                        "imei": "111111111111111",
                        "sellingPrice": "650000",
                        "discount": "100000",
                    }
                ]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SaleItem.objects.count(), 1)

    def test_multiple_items_against_same_batch_decrement_correctly(self):
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [
                    {"stockItem": str(self.stock_item.id), "imei": "111111111111111", "sellingPrice": "650000"},
                    {"stockItem": str(self.stock_item.id), "imei": "222222222222222", "sellingPrice": "650000"},
                ]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.stock_item.refresh_from_db()
        self.assertEqual(self.stock_item.quantity_remaining, 0)

    def test_overselling_beyond_available_quantity_is_blocked(self):
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [
                    {"stockItem": str(self.stock_item.id), "imei": "111111111111111", "sellingPrice": "650000"},
                    {"stockItem": str(self.stock_item.id), "imei": "222222222222222", "sellingPrice": "650000"},
                    {"stockItem": str(self.stock_item.id), "imei": "333333333333333", "sellingPrice": "650000"},
                ]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_imei_is_rejected(self):
        SaleItem.objects.create(
            sale=Sale.objects.create(invoice_number="INV-EXISTING", customer_name="X", payment_method="cash", sold_by=self.seller),
            stock_item=self.stock_item,
            imei="999999999999999",
            selling_price="650000",
        )
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [{"stockItem": str(self.stock_item.id), "imei": "999999999999999", "sellingPrice": "650000"}]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sale_without_imei_is_accepted(self):
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload([{"stockItem": str(self.stock_item.id), "imei": "", "sellingPrice": "650000"}]),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        item = SaleItem.objects.get(sale_id=res.data["id"])
        self.assertIsNone(item.imei)

    def test_multiple_items_without_imei_do_not_collide(self):
        # Blank IMEIs must be stored as NULL, not "" -- otherwise the second item
        # here would hit the unique constraint as a false "duplicate".
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [
                    {"stockItem": str(self.stock_item.id), "imei": "", "sellingPrice": "650000"},
                    {"stockItem": str(self.stock_item.id), "imei": "", "sellingPrice": "650000"},
                ]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SaleItem.objects.filter(imei__isnull=True).count(), 2)

    def test_only_delete_sales_permission_can_delete(self):
        sale = Sale.objects.create(
            invoice_number="INV-DEL-1", customer_name="X", payment_method="cash", sold_by=self.seller
        )
        res = self.client.delete(f"/api/v1/sales/sales/{sale.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.supervisor)
        res = self.client.delete(f"/api/v1/sales/sales/{sale.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_deleting_a_sale_restores_the_stock_it_took(self):
        # Undoing a mistaken sale must put the phone back into available stock --
        # otherwise the deleted sale still leaves the batch permanently short.
        res = self.client.post(
            "/api/v1/sales/sales/",
            self._sale_payload(
                [{"stockItem": str(self.stock_item.id), "imei": "111111111111111", "sellingPrice": "650000"}]
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.stock_item.refresh_from_db()
        self.assertEqual(self.stock_item.quantity_remaining, 1)

        self.client.force_authenticate(self.supervisor)
        res = self.client.delete(f"/api/v1/sales/sales/{res.data['id']}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        self.stock_item.refresh_from_db()
        self.assertEqual(self.stock_item.quantity_remaining, 2)
        self.assertFalse(SaleItem.objects.filter(imei="111111111111111").exists())
