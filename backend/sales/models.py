import uuid

from django.conf import settings
from django.db import models


class Sale(models.Model):
    PAYMENT_CHOICES = [("cash", "Cash"), ("mobile_money", "Mobile Money"), ("card", "Card")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=64, unique=True)
    customer_name = models.CharField(max_length=128)
    customer_phone = models.CharField(max_length=20, blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES)
    notes = models.TextField(blank=True)
    sold_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sales"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["invoice_number"]), models.Index(fields=["created_at"])]


class SaleItem(models.Model):
    """One phone sold. IMEI is required per unit, captured after quantity confirm."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    stock_item = models.ForeignKey("stock.StockItem", on_delete=models.PROTECT, related_name="sale_items")
    imei = models.CharField(max_length=32, unique=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)  # amount the customer actually paid
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # informational only

    class Meta:
        db_table = "sale_items"
        indexes = [models.Index(fields=["imei"])]
