import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("returns_app", "0005_backfill_return_categories"),
    ]

    operations = [
        migrations.RemoveField(model_name="return", name="legacy_category"),
        migrations.AlterField(
            model_name="return",
            name="return_category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="returns",
                to="returns_app.returncategory",
            ),
        ),
    ]
