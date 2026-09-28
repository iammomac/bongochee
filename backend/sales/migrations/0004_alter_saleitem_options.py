from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0003_alter_saleitem_imei"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="saleitem",
            options={"ordering": ["stock_item__category__name", "stock_item__model__name", "imei", "id"]},
        ),
    ]
