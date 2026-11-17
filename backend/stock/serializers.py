from django.db import transaction
from rest_framework import serializers

from stock.models import StockIn, StockItem, StockMovement
from stock.services import record_movement
from suppliers.models import Supplier


class StockItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    model_name = serializers.CharField(source="model.name", read_only=True)
    supplier = serializers.UUIDField(source="stock_in.supplier_id", read_only=True)
    supplier_name = serializers.CharField(source="stock_in.supplier.name", read_only=True)
    import_date = serializers.DateField(source="stock_in.import_date", read_only=True)
    invoice_number = serializers.CharField(source="stock_in.invoice_number", read_only=True)
    # How many lines share this line's supplier/date/invoice -- editing those changes all of them.
    batch_size = serializers.SerializerMethodField()

    class Meta:
        model = StockItem
        fields = (
            "id",
            "category",
            "category_name",
            "model",
            "model_name",
            "supplier",
            "supplier_name",
            "import_date",
            "invoice_number",
            "batch_size",
            "quantity",
            "quantity_remaining",
            "buying_price",
            "min_selling_price",
            "max_selling_price",
            "notes",
        )
        # quantity_remaining is always server-derived from quantity at creation time
        # (see StockInSerializer.create) and afterwards only moves with sales and with a
        # quantity correction (see StockItemEditSerializer) -- never client-writable.
        read_only_fields = ("quantity_remaining",)

    def get_batch_size(self, obj):
        return len(obj.stock_in.items.all())


class StockItemEditSerializer(serializers.ModelSerializer):
    """Correcting an existing stock line. Beyond the line's own fields it also takes the
    supplier / import date / invoice number, which live on the batch (StockIn) the line
    belongs to, so they apply to every line of that batch.

    `quantity` is the total received. Units already sold stay sold, so the amount still in
    stock moves by the same difference: raising 10 -> 15 on a line with 4 sold leaves 11 in
    stock instead of 6, and the quantity can't drop below what has already been sold."""

    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all(), required=False)
    import_date = serializers.DateField(required=False)
    invoice_number = serializers.CharField(required=False, allow_blank=True, max_length=64)

    class Meta:
        model = StockItem
        fields = (
            "category",
            "model",
            "quantity",
            "buying_price",
            "min_selling_price",
            "max_selling_price",
            "notes",
            "supplier",
            "import_date",
            "invoice_number",
        )
        extra_kwargs = {
            "quantity": {"min_value": 1},
            "buying_price": {"min_value": 0},
            "min_selling_price": {"min_value": 0},
            "max_selling_price": {"min_value": 0},
        }

    def validate(self, attrs):
        # Errors go under "detail" -- that's the one key the app's forms show to the user.
        current = self.instance
        category = attrs.get("category", current.category)
        model = attrs.get("model", current.model)
        if model.category_id != category.id:
            raise serializers.ValidationError({"detail": f"{model.name} isn't a {category.name} model."})
        low = attrs.get("min_selling_price", current.min_selling_price)
        high = attrs.get("max_selling_price", current.max_selling_price)
        if high < low:
            raise serializers.ValidationError({"detail": "The max selling price can't be lower than the min."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        # Lock the row so a sale happening right now can't slip between the check and the write.
        item = StockItem.objects.select_for_update().select_related("stock_in__supplier").get(pk=instance.pk)
        batch_changes = {
            field: validated_data.pop(field)
            for field in ("supplier", "import_date", "invoice_number")
            if field in validated_data
        }

        remaining_before = item.quantity_remaining
        if "quantity" in validated_data:
            sold = item.quantity - item.quantity_remaining
            new_quantity = validated_data["quantity"]
            if new_quantity < sold:
                raise serializers.ValidationError(
                    {"detail": f"{sold} already sold from this line, so the quantity can't be less than {sold}."}
                )
            item.quantity_remaining = new_quantity - sold

        for field, value in validated_data.items():
            setattr(item, field, value)
        item.save()
        if item.quantity_remaining != remaining_before:
            request = self.context.get("request")
            record_movement(
                item,
                item.quantity_remaining - remaining_before,
                "adjustment",
                user=getattr(request, "user", None),
                reference=item.stock_in.invoice_number,
                quantity_after=item.quantity_remaining,
            )

        if batch_changes:
            for field, value in batch_changes.items():
                setattr(item.stock_in, field, value)
            item.stock_in.save()
        return item

    def to_representation(self, instance):
        return StockItemSerializer(instance, context=self.context).data


class StockInSerializer(serializers.ModelSerializer):
    items = StockItemSerializer(many=True, required=False)

    class Meta:
        model = StockIn
        fields = ("id", "supplier", "import_date", "invoice_number", "notes", "items", "created_at")
        read_only_fields = ("id", "created_at")

    def validate(self, attrs):
        if not attrs.get("items"):
            raise serializers.ValidationError({"detail": "Add at least one item to the batch."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        stock_in = StockIn.objects.create(**validated_data)
        for item in items_data:
            stock_item = StockItem.objects.create(stock_in=stock_in, quantity_remaining=item["quantity"], **item)
            record_movement(
                stock_item,
                stock_item.quantity,
                "stock_in",
                user=stock_in.created_by,
                reference=stock_in.invoice_number,
                quantity_after=stock_item.quantity_remaining,
            )
        return stock_in


class StockMovementSerializer(serializers.ModelSerializer):
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = ("id", "change", "quantity_after", "reason", "reason_display", "reference", "note", "user_name", "created_at")
        read_only_fields = fields

    def get_user_name(self, obj):
        if obj.user is None:
            return ""
        return obj.user.get_full_name() or obj.user.username
