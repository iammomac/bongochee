import uuid

import django.db.models.deletion
import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):
    """Step 1 of turning return categories from a fixed list into records people can add to:
    create the table and a nullable link, keeping the old text column (renamed) for step 2 to
    copy from. Kept as separate migrations because Postgres won't alter a table in the same
    transaction that has just updated its rows."""

    dependencies = [
        ("returns_app", "0003_alter_returnphoto_image"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReturnCategory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=60)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name_plural": "return categories",
                "db_table": "return_categories",
                "ordering": ["name"],
            },
        ),
        migrations.AddConstraint(
            model_name="returncategory",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("name"), name="uniq_return_category_name_ci"
            ),
        ),
        migrations.RenameField(model_name="return", old_name="return_category", new_name="legacy_category"),
        migrations.AddField(
            model_name="return",
            name="return_category",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="returns",
                to="returns_app.returncategory",
            ),
        ),
    ]
