import io
from datetime import date

from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from rbac.models import Permission, Role
from returns_app.models import ReturnPhoto
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier


def tiny_png():
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color="red").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile("photo.png", buffer.read(), content_type="image/png")


class ReturnsTests(APITestCase):
    def setUp(self):
        perm = Permission.objects.create(codename="create_returns", label="Create Returns", category="returns")
        role = Role.objects.create(name="Support")
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username="support",
            password="Str0ngPassw0rd!",
            phone="255700000060",
            role=role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.user)

        supplier = Supplier.objects.create(name="Blue Telecom")
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.user)
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
            invoice_number="INV-RET-1",
            customer_name="Amina Yusuf",
            customer_phone="255700000099",
            payment_method="cash",
            sold_by=self.user,
        )
        self.sale_item = SaleItem.objects.create(
            sale=sale, stock_item=stock_item, imei="555555555555555", selling_price="650000"
        )

    def test_lookup_by_imei(self):
        res = self.client.get("/api/v1/returns/lookup/", {"q": "555555555555555"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["customerName"], "Amina Yusuf")
        self.assertEqual(results[0]["categoryName"], "Samsung")
        self.assertEqual(results[0]["modelName"], "Galaxy A56")

    def test_lookup_by_partial_invoice_number(self):
        res = self.client.get("/api/v1/returns/lookup/", {"q": "RET-1"})
        self.assertEqual(len(res.json()), 1)

    def test_lookup_by_partial_customer_name(self):
        res = self.client.get("/api/v1/returns/lookup/", {"q": "Amina"})
        self.assertEqual(len(res.json()), 1)

    def _return_payload(self):
        return {
            "saleItem": str(self.sale_item.id),
            "returnDate": str(date.today()),
            "returnCategory": "battery",
            "description": "Battery drains fast",
        }

    def test_duplicate_pending_return_is_rejected(self):
        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_second_return_allowed_after_first_resolved(self):
        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        return_id = res.json()["id"]
        self.client.patch(f"/api/v1/returns/returns/{return_id}/", {"status": "resolved"}, format="json")

        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_second_return_allowed_after_first_cancelled(self):
        # cancelled is a terminal state too — unresolvable, phone stays in the shop —
        # so, like resolved, it shouldn't block a fresh return being filed later.
        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        return_id = res.json()["id"]
        self.client.patch(f"/api/v1/returns/returns/{return_id}/", {"status": "cancelled"}, format="json")

        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_add_photo_creates_photo_tied_to_return(self):
        res = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json")
        return_id = res.json()["id"]

        res = self.client.post(
            f"/api/v1/returns/returns/{return_id}/photos/", {"image": tiny_png()}, format="multipart"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ReturnPhoto.objects.filter(return_record_id=return_id).count(), 1)
