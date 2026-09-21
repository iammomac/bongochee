from returns_app.models import ReturnCategory


def get_or_create_return_category(name):
    """Case-insensitive get-or-create, so "Water damage" and "water damage" are one category."""
    name = " ".join((name or "").split())
    if not name:
        return None, False
    existing = ReturnCategory.objects.filter(name__iexact=name).first()
    if existing:
        return existing, False
    return ReturnCategory.objects.create(name=name), True
