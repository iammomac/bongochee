import uuid

from django.db import models


class Category(models.Model):
    """Phone brand/category, e.g. Samsung, Apple, Tecno. Auto-created on first use."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "categories"
        ordering = ["name"]
        indexes = [models.Index(fields=["name"])]

    def __str__(self):
        return self.name


class PhoneModel(models.Model):
    """Model within a category, e.g. Galaxy S25 Ultra under Samsung. Auto-created on first use."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="models")
    name = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "phone_models"
        unique_together = ("category", "name")
        indexes = [models.Index(fields=["category", "name"])]

    def __str__(self):
        return f"{self.category.name} {self.name}"
