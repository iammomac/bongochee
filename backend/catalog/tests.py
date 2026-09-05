from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from rbac.models import Permission, Role
from stock.models import StockIn, StockItem
from suppliers.models import Supplier


class CatalogGetOrCreateTests(APITestCase):
    def setUp(self):
        perm = Permission.objects.create(codename="add_stock", label="Add Stock", category="stock")
        role = Role.objects.create(name="Stocker")
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username="stocker",
            password="Str0ngPassw0rd!",
            phone="255700000020",
            role=role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.user)

    def test_category_get_or_create_is_case_insensitive(self):
        res = self.client.post("/api/v1/catalog/categories/", {"name": "Samsung"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        first_id = res.json()["id"]

        res = self.client.post("/api/v1/catalog/categories/", {"name": "samsung"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["id"], first_id)
        self.assertEqual(Category.objects.count(), 1)

    def test_model_get_or_create_scoped_to_category(self):
        cat_a = Category.objects.create(name="Samsung")
        cat_b = Category.objects.create(name="Apple")

        res = self.client.post("/api/v1/catalog/models/", {"category": str(cat_a.id), "name": "Flagship"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        res = self.client.post("/api/v1/catalog/models/", {"category": str(cat_b.id), "name": "Flagship"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PhoneModel.objects.filter(name="Flagship").count(), 2)

        res = self.client.post("/api/v1/catalog/models/", {"category": str(cat_a.id), "name": "flagship"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(PhoneModel.objects.filter(category=cat_a, name="Flagship").count(), 1)

    def test_model_creation_requires_valid_category(self):
        res = self.client.post("/api/v1/catalog/models/", {"name": "Orphan"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deleting_category_with_stock_returns_friendly_400(self):
        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        supplier = Supplier.objects.create(name="Blue Telecom")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.user)
        StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=5,
            quantity_remaining=5,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )

        res = self.client.delete(f"/api/v1/catalog/categories/{category.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Category.objects.filter(id=category.id).exists())
