import uuid

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models

from config.validators import ALLOWED_IMAGE_EXTENSIONS, validate_image_size


class Return(models.Model):
    RETURN_CATEGORY_CHOICES = [
        ("display", "Display"), ("battery", "Battery"), ("charging", "Charging"),
        ("camera", "Camera"), ("speaker", "Speaker"), ("software", "Software"),
        ("network", "Network"), ("other", "Other"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),       # just filed, no action taken yet
        ("processing", "Processing"),  # actively being investigated
        ("resolved", "Resolved"),     # issue cleared
        ("cancelled", "Cancelled"),   # unresolvable — phone stays in shop, no resale/profit on this unit
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale_item = models.ForeignKey("sales.SaleItem", on_delete=models.PROTECT, related_name="returns")
    return_date = models.DateField()
    return_category = models.CharField(max_length=20, choices=RETURN_CATEGORY_CHOICES)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="returns_processed")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "returns"
        ordering = ["-return_date"]


class ReturnPhoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    return_record = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(
        upload_to="return_photos/",
        validators=[validate_image_size, FileExtensionValidator(ALLOWED_IMAGE_EXTENSIONS)],
    )

    class Meta:
        db_table = "return_photos"
