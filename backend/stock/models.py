import uuid

from django.conf import settings
from django.db import models

# Shared with reports/views.py's dashboard summary and notifications/... (low-stock
# alerts) so "low stock" means the same quantity everywhere in the app.
LOW_STOCK_THRESHOLD = 5


class StockIn(models.Model):
    """One import batch/invoice from a supplier. StockItem rows hold the line items."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey("suppliers.Supplier", on_delete=models.PROTECT, related_name="stock_ins")
    import_date = models.DateField()
    invoice_number = models.CharField(max_length=64, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stock_ins")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_ins"
        ordering = ["-import_date"]


class StockItem(models.Model):
    """A line item within a StockIn batch. No IMEI required at import time."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stock_in = models.ForeignKey(StockIn, on_delete=models.CASCADE, related_name="items")
    category = models.ForeignKey("catalog.Category", on_delete=models.PROTECT, related_name="stock_items")
    model = models.ForeignKey("catalog.PhoneModel", on_delete=models.PROTECT, related_name="stock_items")
    quantity = models.PositiveIntegerField()
    quantity_remaining = models.PositiveIntegerField()  # decremented as sales consume this batch
    buying_price = models.DecimalField(max_digits=12, decimal_places=2)
    min_selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    max_selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    # Per-unit/line condition -- e.g. "full box", "used, screen scratch" -- distinct
    # from StockIn.notes (a general remark about the whole invoice/batch), since a
    # single batch can mix models/conditions across its rows.
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "stock_items"
        indexes = [models.Index(fields=["model"]), models.Index(fields=["category"])]

    def __str__(self):
        return f"{self.model} x{self.quantity_remaining}"
