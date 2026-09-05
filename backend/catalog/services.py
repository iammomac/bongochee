from catalog.models import Category, PhoneModel


def get_or_create_category(name):
    """Case-insensitive get-or-create so 'Samsung' and 'samsung' never end up as two rows."""
    name = (name or "").strip()
    if not name:
        return None, False
    existing = Category.objects.filter(name__iexact=name).first()
    if existing:
        return existing, False
    return Category.objects.create(name=name), True


def get_or_create_model(category, name):
    """Same idempotent behavior as get_or_create_category, scoped to a category."""
    name = (name or "").strip()
    if not name or not category:
        return None, False
    existing = PhoneModel.objects.filter(category=category, name__iexact=name).first()
    if existing:
        return existing, False
    return PhoneModel.objects.create(category=category, name=name), True
