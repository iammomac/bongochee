import uuid

from django.db import models


class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "suppliers"
        ordering = ["name"]

    def __str__(self):
        return self.name
