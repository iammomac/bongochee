import uuid

from django.conf import settings
from django.db import models

from sales.models import Sale


class LoanSale(models.Model):
    """A wholesale sale to another business, paid off over time rather than in
    full up front -- Bongo Chee sells at the cheapest price around, so resellers
    buy in and pay back as they resell the phones themselves."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=64, unique=True)
    business_name = models.CharField(max_length=128)
    contact_person = models.CharField(max_length=128, blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)
    sold_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="loan_sales")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "loan_sales"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["invoice_number"]), models.Index(fields=["created_at"])]


class LoanSaleItem(models.Model):
    """One phone handed over on credit. Mirrors sales.SaleItem -- same optional,
    globally-unique IMEI convention -- but points at LoanSale instead."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    loan_sale = models.ForeignKey(LoanSale, on_delete=models.CASCADE, related_name="items")
    stock_item = models.ForeignKey("stock.StockItem", on_delete=models.PROTECT, related_name="loan_sale_items")
    imei = models.CharField(max_length=32, unique=True, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)  # amount owed for this unit
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "loan_sale_items"
        indexes = [models.Index(fields=["imei"])]


class LoanPayment(models.Model):
    """One installment paid against a loan sale's balance -- the running history
    of what a business has paid back so far."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    loan_sale = models.ForeignKey(LoanSale, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=Sale.PAYMENT_CHOICES, default="cash")
    paid_date = models.DateField()
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="loan_payments_recorded"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "loan_payments"
        ordering = ["-paid_date", "-created_at"]
