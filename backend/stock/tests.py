import io
from datetime import date

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from rbac.models import Permission, Role
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_xlsx(header, rows):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(header)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer


class StockInTests(APITestCase):
    def setUp(self):
        perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        role = Role.objects.create(name="Stocker")
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username="stocker",
            password="Str0ngPassw0rd!",
            phone="255700000030",
            role=role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.user)
        self.supplier = Supplier.objects.create(name="Blue Telecom")

    def test_stock_in_requires_at_least_one_item(self):
        res = self.client.post(
            "/api/v1/stock/stock-ins/",
            {"supplier": str(self.supplier.id), "importDate": str(date.today()), "items": []},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_in_creates_nested_items(self):
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        res = self.client.post(
            "/api/v1/stock/stock-ins/",
            {
                "supplier": str(self.supplier.id),
                "importDate": str(date.today()),
                "invoiceNumber": "INV-100",
                "items": [
                    {
                        "category": str(category.id),
                        "model": str(model.id),
                        "quantity": 10,
                        "buyingPrice": "500000",
                        "minSellingPrice": "600000",
                        "maxSellingPrice": "700000",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(StockItem.objects.count(), 1)
        item = StockItem.objects.first()
        self.assertEqual(item.quantity_remaining, 10)

    def test_import_preview_resolves_and_creates_idempotently(self):
        header = ["Category", "Model", "Quantity", "Buying Price", "Min Selling Price", "Max Selling Price"]
        file_one = build_xlsx(header, [("Samsung", "Galaxy A56", 10, 500000, 600000, 700000)])
        upload = SimpleUploadedFile("stock.xlsx", file_one.read(), content_type=XLSX_CONTENT_TYPE)
        res = self.client.post("/api/v1/stock/import-preview/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]["error"])
        self.assertEqual(rows[0]["category"]["name"], "Samsung")
        self.assertEqual(Category.objects.filter(name="Samsung").count(), 1)

        file_two = build_xlsx(header, [("samsung", "galaxy a56", 5, 500000, 600000, 700000)])
        upload_two = SimpleUploadedFile("stock2.xlsx", file_two.read(), content_type=XLSX_CONTENT_TYPE)
        self.client.post("/api/v1/stock/import-preview/", {"file": upload_two}, format="multipart")
        self.assertEqual(Category.objects.filter(name__iexact="samsung").count(), 1)
        self.assertEqual(PhoneModel.objects.filter(name__iexact="galaxy a56").count(), 1)

    def test_import_preview_reports_row_errors_without_dropping_them(self):
        header = ["Category", "Model", "Quantity", "Buying Price", "Min Selling Price", "Max Selling Price"]
        file = build_xlsx(header, [("Samsung", "Galaxy A56", "not-a-number", 500000, 600000, 700000)])
        upload = SimpleUploadedFile("stock.xlsx", file.read(), content_type=XLSX_CONTENT_TYPE)
        res = self.client.post("/api/v1/stock/import-preview/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertIn("Quantity", rows[0]["error"])

    def test_import_preview_requires_expected_columns(self):
        file = build_xlsx(["Category", "Model"], [("Samsung", "Galaxy A56")])
        upload = SimpleUploadedFile("bad.xlsx", file.read(), content_type=XLSX_CONTENT_TYPE)
        res = self.client.post("/api/v1/stock/import-preview/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class StockItemAccessTests(APITestCase):
    def setUp(self):
        create_sales_perm = Permission.objects.create(codename="create_sales", label="Create Sales", category="sales")
        role = Role.objects.create(name="Seller")
        role.permissions.add(create_sales_perm)
        self.seller = User.objects.create_user(
            username="seller3",
            password="Str0ngPassw0rd!",
            phone="255700000050",
            role=role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.seller)

        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.seller)
        self.in_stock = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=5,
            quantity_remaining=5,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )
        self.sold_out = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=3,
            quantity_remaining=0,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )

    def test_create_sales_only_user_can_list_stock_items(self):
        res = self.client.get("/api/v1/stock/stock-items/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_quantity_remaining_filter_excludes_sold_out_batches(self):
        res = self.client.get("/api/v1/stock/stock-items/", {"quantity_remaining__gt": 0})
        ids = [item["id"] for item in res.json()["results"]] if "results" in res.json() else [
            item["id"] for item in res.json()
        ]
        self.assertIn(str(self.in_stock.id), ids)
        self.assertNotIn(str(self.sold_out.id), ids)


class StockItemDeleteTests(APITestCase):
    def setUp(self):
        add_perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        delete_perm = Permission.objects.create(codename="delete_stock", label="Delete Stock", category="stock")
        role = Role.objects.create(name="Stocker")
        role.permissions.add(add_perm, delete_perm)
        self.stocker = User.objects.create_user(
            username="stocker4", password="Str0ngPassw0rd!", phone="255700000053", role=role, must_change_password=False
        )

        add_only_role = Role.objects.create(name="StockerNoDelete")
        add_only_role.permissions.add(add_perm)
        self.stocker_no_delete = User.objects.create_user(
            username="stocker5", password="Str0ngPassw0rd!", phone="255700000054", role=add_only_role, must_change_password=False
        )

        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        self.stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.stocker)
        self.untouched = StockItem.objects.create(
            stock_in=self.stock_in, category=category, model=model,
            quantity=5, quantity_remaining=5,
            buying_price="500000", min_selling_price="600000", max_selling_price="700000",
        )
        self.partially_sold = StockItem.objects.create(
            stock_in=self.stock_in, category=category, model=model,
            quantity=5, quantity_remaining=4,
            buying_price="500000", min_selling_price="600000", max_selling_price="700000",
        )
        sale = Sale.objects.create(invoice_number="INV-DEL-1", customer_name="X", payment_method="cash", sold_by=self.stocker)
        SaleItem.objects.create(sale=sale, stock_item=self.partially_sold, selling_price="650000")

    def test_untouched_line_can_be_deleted(self):
        self.client.force_authenticate(self.stocker)
        res = self.client.delete(f"/api/v1/stock/stock-items/{self.untouched.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StockItem.objects.filter(id=self.untouched.id).exists())

    def test_line_with_a_sale_against_it_cannot_be_deleted(self):
        self.client.force_authenticate(self.stocker)
        res = self.client.delete(f"/api/v1/stock/stock-items/{self.partially_sold.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(StockItem.objects.filter(id=self.partially_sold.id).exists())

    def test_user_without_delete_stock_permission_is_denied(self):
        self.client.force_authenticate(self.stocker_no_delete)
        res = self.client.delete(f"/api/v1/stock/stock-items/{self.untouched.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(StockItem.objects.filter(id=self.untouched.id).exists())


class StockItemNotesTests(APITestCase):
    def setUp(self):
        perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        role = Role.objects.create(name="Stocker")
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username="stocker6", password="Str0ngPassw0rd!", phone="255700000055", role=role, must_change_password=False
        )
        self.client.force_authenticate(self.user)
        self.supplier = Supplier.objects.create(name="Blue Telecom")

    def test_notes_saved_and_returned_per_line(self):
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        res = self.client.post(
            "/api/v1/stock/stock-ins/",
            {
                "supplier": str(self.supplier.id),
                "importDate": str(date.today()),
                "items": [
                    {
                        "category": str(category.id), "model": str(model.id),
                        "quantity": 2, "buyingPrice": "500000",
                        "minSellingPrice": "600000", "maxSellingPrice": "700000",
                        "notes": "Full box, unused",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        item = StockItem.objects.get()
        self.assertEqual(item.notes, "Full box, unused")
        list_res = self.client.get("/api/v1/stock/stock-items/")
        body = list_res.json()
        rows = body["results"] if "results" in body else body
        self.assertEqual(rows[0]["notes"], "Full box, unused")


class StockImportTemplateTests(APITestCase):
    def setUp(self):
        add_stock_perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        stocker_role = Role.objects.create(name="Stocker")
        stocker_role.permissions.add(add_stock_perm)
        self.stocker = User.objects.create_user(
            username="stocker3", password="Str0ngPassw0rd!", phone="255700000051", role=stocker_role, must_change_password=False
        )

        no_perm_role = Role.objects.create(name="NoPerms")
        self.outsider = User.objects.create_user(
            username="outsider2", password="Str0ngPassw0rd!", phone="255700000052", role=no_perm_role, must_change_password=False
        )

    def test_add_stock_holder_can_download_template(self):
        self.client.force_authenticate(self.stocker)
        res = self.client.get("/api/v1/stock/import-template/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        workbook = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertEqual(workbook.sheetnames, ["Stock Import Template", "Instructions"])
        header_row = [cell.value for cell in workbook["Stock Import Template"][1]]
        self.assertEqual(
            header_row, ["Category", "Model", "Quantity", "Buying Price", "Min Selling Price", "Max Selling Price"]
        )

    def test_user_without_add_stock_is_denied(self):
        self.client.force_authenticate(self.outsider)
        res = self.client.get("/api/v1/stock/import-template/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
