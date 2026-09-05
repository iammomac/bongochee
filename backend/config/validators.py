from django.core.exceptions import ValidationError

MAX_IMAGE_SIZE_MB = 5
ALLOWED_IMAGE_EXTENSIONS = ("jpg", "jpeg", "png", "webp")


def validate_image_size(file):
    max_bytes = MAX_IMAGE_SIZE_MB * 1024 * 1024
    if file.size > max_bytes:
        raise ValidationError(f"Image must be under {MAX_IMAGE_SIZE_MB}MB.")
