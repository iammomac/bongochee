from rest_framework import serializers

from stock.models import StockIn, StockItem


class StockItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    model_name = serializers.CharField(source="model.name", read_only=True)
    supplier_name = serializers.CharField(source="stock_in.supplier.name", read_only=True)
    import_date = serializers.DateField(source="stock_in.import_date", read_only=True)

    class Meta:
        model = StockItem
        fields = (
            "id",
            "category",
            "category_name",
            "model",
            "model_name",
            "supplier_name",
            "import_date",
            "quantity",
            "quantity_remaining",
            "buying_price",
            "min_selling_price",
            "max_selling_price",
            "notes",
        )
        # quantity_remaining is always server-derived from quantity at creation time
        # (see StockInSerializer.create) and only ever decremented by sales afterward —
        # never client-writable.
        read_only_fields = ("quantity_remaining",)


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

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        stock_in = StockIn.objects.create(**validated_data)
        for item in items_data:
            StockItem.objects.create(stock_in=stock_in, quantity_remaining=item["quantity"], **item)
        return stock_in
