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
    # A sale entered by mistake is voided, never deleted: it stays on record (who, when, why),
    # its phones go back into stock, and it's left out of every total and report.
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="voided_sales"
    )
    void_reason = models.TextField(blank=True)

    @property
    def is_voided(self):
        return self.voided_at is not None

    class Meta:
        db_table = "sales"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["invoice_number"]), models.Index(fields=["created_at"])]


class SaleItem(models.Model):
    """One phone sold. IMEI is captured per unit after quantity confirm when the
    seller has it on hand, but isn't required — some phones are sold without one
    on record."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    stock_item = models.ForeignKey("stock.StockItem", on_delete=models.PROTECT, related_name="sale_items")
    # null (not "") when absent -- a unique index allows any number of NULLs but only
    # one of any given non-null value, so multiple IMEI-less sales don't collide.
    imei = models.CharField(max_length=32, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)  # amount the customer actually paid
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # informational only
    # False once this phone is no longer the customer's: its sale was voided, or it was
    # returned and put back on sale. The record stays, but its IMEI is free to be sold again.
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "sale_items"
        indexes = [models.Index(fields=["imei"])]
        constraints = [
            models.UniqueConstraint(
                fields=["imei"], condition=models.Q(is_active=True), name="unique_active_sale_item_imei"
            )
        ]
        # A sale's phones always list in the same order (receipt, edit form), rather than in
        # whatever order the database happens to return rows after an update.
        ordering = ["stock_item__category__name", "stock_item__model__name", "imei", "id"]
