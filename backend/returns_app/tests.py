import io
from datetime import date

from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from rbac.models import Permission, Role
from returns_app.models import ReturnCategory, ReturnPhoto
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
        edit_perm = Permission.objects.create(codename="edit_returns", label="Edit Returns", category="returns")
        role = Role.objects.create(name="Support")
        role.permissions.add(perm, edit_perm)
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

    def _sell(self, model_name, customer, invoice, brand="Samsung", phone="255711000000"):
        category, _ = Category.objects.get_or_create(name=brand)
        model, _ = PhoneModel.objects.get_or_create(category=category, name=model_name)
        stock_in = StockIn.objects.create(
            supplier=Supplier.objects.get(name="Blue Telecom"), import_date=date.today(), created_by=self.user
        )
        stock_item = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=5,
            quantity_remaining=4,
            buying_price="900000",
            min_selling_price="1000000",
            max_selling_price="1200000",
        )
        sale = Sale.objects.create(
            invoice_number=invoice, customer_name=customer, customer_phone=phone, payment_method="cash", sold_by=self.user
        )
        return SaleItem.objects.create(sale=sale, stock_item=stock_item, imei=f"IMEI-{invoice}", selling_price="1100000")

    def _customers(self, query):
        res = self.client.get("/api/v1/returns/lookup/", {"q": query})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return sorted(row["customerName"] for row in res.json())

    def test_lookup_by_model_lists_every_customer_who_bought_it(self):
        self._sell("Galaxy S23 Ultra", "Juma Ali", "INV-S1")
        self._sell("Galaxy S23 Ultra", "Neema Said", "INV-S2")
        self._sell("Galaxy S23", "Zawadi Omar", "INV-S3")

        self.assertEqual(self._customers("S23 Ultra"), ["Juma Ali", "Neema Said"])
        # The plain S23 is a substring of both models, so all three sales appear.
        self.assertEqual(self._customers("S23"), ["Juma Ali", "Neema Said", "Zawadi Omar"])

    def test_lookup_model_ignores_spacing_and_case(self):
        self._sell("Galaxy S23 Ultra", "Juma Ali", "INV-S1")
        self._sell("Galaxy S23", "Zawadi Omar", "INV-S3")

        self.assertEqual(self._customers("s23u"), ["Juma Ali"])
        self.assertEqual(self._customers("GALAXY S23U"), ["Juma Ali"])
        self.assertEqual(self._customers("samsung s23 ultra"), ["Juma Ali"])

    def test_lookup_by_brand_lists_all_of_that_brand(self):
        self._sell("iPhone 15", "Halima Musa", "INV-A1", brand="Apple")

        self.assertEqual(self._customers("apple"), ["Halima Musa"])
        self.assertEqual(self._customers("samsung"), ["Amina Yusuf"])

    def test_lookup_combines_a_model_word_with_a_customer_word(self):
        self._sell("Galaxy S23 Ultra", "Juma Ali", "INV-S1")
        self._sell("Galaxy S23 Ultra", "Neema Said", "INV-S2")

        self.assertEqual(self._customers("s23 neema"), ["Neema Said"])

    def test_lookup_by_customer_phone_number(self):
        self._sell("Galaxy S23 Ultra", "Juma Ali", "INV-S1", phone="255744123456")
        self.assertEqual(self._customers("744123"), ["Juma Ali"])

    def test_lookup_returns_nothing_for_an_unknown_model(self):
        self.assertEqual(self._customers("Pixel 9"), [])

    def test_lookup_lists_the_newest_sales_first_and_caps_the_list(self):
        for i in range(35):
            self._sell("Galaxy S23 Ultra", f"Buyer {i}", f"INV-B{i}")
        res = self.client.get("/api/v1/returns/lookup/", {"q": "s23 ultra"})
        rows = res.json()
        self.assertEqual(len(rows), 30)
        self.assertEqual(rows[0]["customerName"], "Buyer 34")

    def _category(self, name="Battery"):
        return ReturnCategory.objects.get_or_create(name=name)[0]

    def _return_payload(self):
        return {
            "saleItem": str(self.sale_item.id),
            "returnDate": str(date.today()),
            "returnCategory": str(self._category().id),
            "description": "Battery drains fast",
        }

    def test_the_original_kinds_of_fault_are_already_available(self):
        names = [row["name"] for row in self.client.get("/api/v1/returns/categories/").json()["results"]]
        for expected in ("Battery", "Camera", "Charging", "Display", "Network", "Other", "Software", "Speaker"):
            self.assertIn(expected, names)

    def test_a_new_return_category_can_be_added_and_used(self):
        res = self.client.post("/api/v1/returns/categories/", {"name": "Water damage"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_id = res.json()["id"]
        self.assertEqual(res.json()["name"], "Water damage")

        payload = {**self._return_payload(), "returnCategory": new_id}
        created = self.client.post("/api/v1/returns/returns/", payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.json()["returnCategoryDisplay"], "Water damage")
        self.assertEqual(created.json()["returnCategory"], new_id)

    def test_adding_a_category_that_exists_returns_it_instead_of_a_duplicate(self):
        first = self.client.post("/api/v1/returns/categories/", {"name": "Water damage"}, format="json").json()
        again = self.client.post("/api/v1/returns/categories/", {"name": "  water   DAMAGE "}, format="json")
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.json()["id"], first["id"])
        self.assertEqual(ReturnCategory.objects.filter(name__iexact="water damage").count(), 1)

    def test_a_blank_or_overlong_category_name_is_refused(self):
        self.assertEqual(
            self.client.post("/api/v1/returns/categories/", {"name": "   "}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post("/api/v1/returns/categories/", {"name": "x" * 61}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_categories_can_be_searched_by_name(self):
        names = [row["name"] for row in self.client.get("/api/v1/returns/categories/", {"search": "bat"}).json()["results"]]
        self.assertEqual(names, ["Battery"])

    def test_someone_who_cannot_file_returns_cannot_list_or_add_categories(self):
        self.client.force_authenticate(User.objects.create_user(
            username="nobody", password="Str0ngPassw0rd!", phone="255700000088", must_change_password=False
        ))
        self.assertEqual(self.client.get("/api/v1/returns/categories/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post("/api/v1/returns/categories/", {"name": "Water damage"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_a_return_needs_a_real_category(self):
        payload = {**self._return_payload(), "returnCategory": "battery"}
        self.assertEqual(
            self.client.post("/api/v1/returns/returns/", payload, format="json").status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_a_return_can_be_moved_to_another_category(self):
        created = self.client.post("/api/v1/returns/returns/", self._return_payload(), format="json").json()
        new = self.client.post("/api/v1/returns/categories/", {"name": "Water damage"}, format="json").json()
        res = self.client.patch(f"/api/v1/returns/returns/{created['id']}/", {"returnCategory": new["id"]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["returnCategoryDisplay"], "Water damage")

    def test_returns_report_groups_by_the_new_category_too(self):
        self.client.post("/api/v1/returns/returns/", {**self._return_payload(), "returnCategory": str(self._category("Water damage").id)}, format="json")
        # The reports need view_reports on top of returns access.
        self.user.role.permissions.add(Permission.objects.create(codename="view_reports", label="View Reports", category="reports"))
        res = self.client.get("/api/v1/reports/returns-summary/", {"date_from": str(date.today()), "date_to": str(date.today())})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([(row["label"], row["count"]) for row in res.json()["rows"]], [("Water damage", 1)])

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
