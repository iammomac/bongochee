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


class SaleEditTests(APITestCase):
    def setUp(self):
        create_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")
        edit_perm = Permission.objects.create(codename="edit_sales", label="Edit Sales", category="sales")
        seller_role = Role.objects.create(name="Seller")
        seller_role.permissions.add(create_perm)
        editor_role = Role.objects.create(name="Editor")
        editor_role.permissions.add(create_perm, edit_perm)
        self.seller = User.objects.create_user(
            username="seller", password="Str0ngPassw0rd!", phone="255700000040", role=seller_role, must_change_password=False
        )
        self.editor = User.objects.create_user(
            username="editor", password="Str0ngPassw0rd!", phone="255700000042", role=editor_role, must_change_password=False
        )
        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        other_model = PhoneModel.objects.create(category=category, name="Galaxy S23")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.seller)

        def stock(m):
            return StockItem.objects.create(
                stock_in=stock_in, category=category, model=m, quantity=5, quantity_remaining=4,
                buying_price="500000", min_selling_price="600000", max_selling_price="700000",
            )

        self.stock_item = stock(model)
        self.other_stock = stock(other_model)
        sale = Sale.objects.create(
            invoice_number="INV-EDIT-1", customer_name="Juma", payment_method="cash", sold_by=self.seller
        )
        self.first = SaleItem.objects.create(sale=sale, stock_item=self.stock_item, imei="111111111111111", selling_price="650000")
        self.second = SaleItem.objects.create(sale=sale, stock_item=self.other_stock, imei="222222222222222", selling_price="700000")
        self.sale = sale
        self.client.force_authenticate(self.editor)

    def _patch(self, first=None, second=None, **header):
        def line(item, overrides):
            base = {
                "id": str(item.id), "stockItem": str(item.stock_item_id), "imei": item.imei,
                "sellingPrice": str(item.selling_price), "discount": str(item.discount),
            }
            return {**base, **(overrides or {})}

        payload = {"items": [line(self.first, first), line(self.second, second)], **header}
        return self.client.patch(f"/api/v1/sales/sales/{self.sale.id}/", payload, format="json")

    def test_price_discount_and_customer_can_be_edited(self):
        res = self._patch(first={"sellingPrice": "640000", "discount": "10000"}, customerName="Juma Ali", notes="paid later")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.sale.refresh_from_db()
        self.assertEqual((str(self.first.selling_price), str(self.first.discount)), ("640000.00", "10000.00"))
        self.assertEqual((self.sale.customer_name, self.sale.notes), ("Juma Ali", "paid later"))

    def test_the_response_is_the_updated_sale_ready_to_show_as_a_receipt(self):
        body = self._patch(first={"sellingPrice": "640000"}).json()
        self.assertEqual(body["invoiceNumber"], "INV-EDIT-1")
        self.assertEqual(len(body["items"]), 2)
        self.assertEqual({item["sellingPrice"] for item in body["items"]}, {640000, 700000})

    def test_a_wrong_imei_can_be_corrected(self):
        res = self._patch(first={"imei": "333333333333333"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.assertEqual(self.first.imei, "333333333333333")
        self.assertIn("333333333333333", [item["imei"] for item in res.json()["items"]])

    def test_an_imei_can_be_cleared(self):
        self._patch(first={"imei": ""})
        self.first.refresh_from_db()
        self.assertIsNone(self.first.imei)

    def test_an_imei_belonging_to_another_sale_is_refused_and_nothing_changes(self):
        elsewhere = Sale.objects.create(invoice_number="INV-OTHER", customer_name="X", payment_method="cash", sold_by=self.seller)
        SaleItem.objects.create(sale=elsewhere, stock_item=self.stock_item, imei="999999999999999", selling_price="650000")

        res = self._patch(first={"imei": "999999999999999", "sellingPrice": "1"}, customerName="Changed")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already recorded", res.json()["detail"])
        self.first.refresh_from_db()
        self.sale.refresh_from_db()
        self.assertEqual((self.first.imei, str(self.first.selling_price), self.sale.customer_name), ("111111111111111", "650000.00", "Juma"))

    def test_the_same_imei_on_two_lines_of_this_sale_is_refused(self):
        res = self._patch(first={"imei": "444444444444444"}, second={"imei": "444444444444444"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_swapping_two_imeis_within_a_sale_is_not_possible_but_keeping_them_is_fine(self):
        # Sending each line's own IMEI back unchanged must not look like a duplicate.
        self.assertEqual(self._patch(first={"sellingPrice": "651000"}).status_code, status.HTTP_200_OK)

    def test_an_imei_that_is_on_a_loan_sale_is_refused(self):
        from loans.models import LoanSale, LoanSaleItem

        loan = LoanSale.objects.create(invoice_number="LOAN-EDIT", business_name="Kariakoo", sold_by=self.seller)
        LoanSaleItem.objects.create(loan_sale=loan, stock_item=self.stock_item, imei="555555555555555", selling_price="650000")
        res = self._patch(first={"imei": "555555555555555"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_phone_itself_cannot_be_swapped_and_stock_is_untouched(self):
        res = self._patch(first={"stockItem": str(self.other_stock.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.stock_item.refresh_from_db()
        self.other_stock.refresh_from_db()
        self.assertEqual(self.first.stock_item_id, self.stock_item.id)
        self.assertEqual((self.stock_item.quantity_remaining, self.other_stock.quantity_remaining), (4, 4))

    def test_someone_without_edit_sales_cannot_edit(self):
        self.client.force_authenticate(self.seller)
        self.assertEqual(self._patch(customerName="Nope").status_code, status.HTTP_403_FORBIDDEN)

    def test_a_sales_phones_always_come_back_in_the_same_order(self):
        # Brand then model: the A56 before the S23, however the rows were written.
        for _ in range(3):
            body = self._patch(second={"sellingPrice": "710000"}).json()
            self.assertEqual([item["modelName"] for item in body["items"]], ["Galaxy A56", "Galaxy S23"])
