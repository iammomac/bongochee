from django.db import migrations

# The fixed list the app shipped with (old stored value -> name shown to people). Listed here
# rather than imported so this migration keeps working whatever the models look like later.
DEFAULTS = [
    ("display", "Display"),
    ("battery", "Battery"),
    ("charging", "Charging"),
    ("camera", "Camera"),
    ("speaker", "Speaker"),
    ("software", "Software"),
    ("network", "Network"),
    ("other", "Other"),
]


def backfill(apps, schema_editor):
    ReturnCategory = apps.get_model("returns_app", "ReturnCategory")
    Return = apps.get_model("returns_app", "Return")

    by_value = {}
    for value, name in DEFAULTS:
        by_value[value], _ = ReturnCategory.objects.get_or_create(name=name)

    for value, category in by_value.items():
        Return.objects.filter(legacy_category=value).update(return_category=category)
    # Anything with a value outside the old list (shouldn't exist) becomes "Other" rather than
    # blocking the next step.
    Return.objects.filter(return_category__isnull=True).update(return_category=by_value["other"])


class Migration(migrations.Migration):
    dependencies = [
        ("returns_app", "0004_returncategory_and_link"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
