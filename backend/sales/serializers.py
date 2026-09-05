from rest_framework import serializers

from notifications.services import notify_permission_holders
from sales.models import Sale, SaleItem
from stock.models import LOW_STOCK_THRESHOLD, StockItem


class SaleItemSerializer(serializers.ModelSerializer):
    # Writable (not the ModelSerializer PK default of read-only) so an edit payload can
    # identify which existing line to update — see SaleSerializer.update() below. Left
    # optional so the create flow (which never sends one) is unaffected.
    id = serializers.UUIDField(required=False)
    # Explicit field, no auto UniqueValidator: this is a nested list serializer with no
    # per-child instance, so DRF can't exclude "this row" from the uniqueness check —
    # editing a sale while echoing back its own unchanged IMEI would otherwise be
    # rejected as a false duplicate. The model's own unique=True still blocks two
    # different SaleItems ever sharing an IMEI when new rows are actually created.
    imei = serializers.CharField(max_length=32)
    model_name = serializers.CharField(source="stock_item.model.name", read_only=True)
    category_name = serializers.CharField(source="stock_item.category.name", read_only=True)

    class Meta:
        model = SaleItem
        fields = ("id", "stock_item", "model_name", "category_name", "imei", "selling_price", "discount")


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, required=False)
    sold_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = (
            "id",
            "invoice_number",
            "customer_name",
            "customer_phone",
            "payment_method",
            "notes",
            "items",
            "sold_by",
            "sold_by_name",
            "created_at",
        )
        read_only_fields = ("id", "sold_by", "sold_by_name", "created_at")

    def get_sold_by_name(self, obj):
        return obj.sold_by.get_full_name() or obj.sold_by.username

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        sale = Sale.objects.create(**validated_data, sold_by=self.context["request"].user)
        for item_data in items_data:
            # Re-fetch fresh rather than reuse item_data["stock_item"] (resolved at
            # validation time, before any decrements): multiple items in this same
            # request can reference the same batch, and each iteration must see the
            # latest quantity_remaining or overselling slips through.
            stock_item = StockItem.objects.get(id=item_data["stock_item"].id)
            if stock_item.quantity_remaining < 1:
                raise serializers.ValidationError({"detail": f"{stock_item} is out of stock"})
            # The seller can bargain below the batch's min/max_selling_price (e.g. clearance) —
            # this is intentionally NOT a hard block. A sale whose net price (after discount)
            # lands below min_selling_price, or below buying_price, still goes through; it just
            # surfaces afterward on the Loss Report (see reports/services.py) so it's visible
            # rather than silently allowed.
            previous_remaining = stock_item.quantity_remaining
            stock_item.quantity_remaining -= 1
            stock_item.save(update_fields=["quantity_remaining"])
            SaleItem.objects.create(sale=sale, **item_data)

            # Fire exactly once per crossing — not on every subsequent sale of an
            # already-low/empty batch — by comparing the value just before this
            # decrement against just after it.
            new_remaining = stock_item.quantity_remaining
            if previous_remaining > 0 and new_remaining == 0:
                notify_permission_holders(
                    "add_stock",
                    "out_of_stock",
                    title=f"{stock_item} is out of stock",
                    message=f"{stock_item} sold out after this sale.",
                    link="/stock",
                )
            elif previous_remaining > LOW_STOCK_THRESHOLD >= new_remaining:
                notify_permission_holders(
                    "add_stock",
                    "low_stock",
                    title=f"{stock_item} is low on stock",
                    message=f"Only {new_remaining} left.",
                    link="/stock",
                )
        return sale

    def update(self, instance, validated_data):
        # Header fields (customer/payment/notes/invoice) are freely editable. Line
        # items are matched by id and only selling_price/discount are ever touched —
        # stock_item/imei are intentionally ignored even if the client sends different
        # values, since swapping either here would desync StockItem.quantity_remaining
        # (decremented once, at creation, in create() above) from reality.
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            items_by_id = {item.id: item for item in instance.items.all()}
            for item_data in items_data:
                item = items_by_id.get(item_data.get("id"))
                if item is None:
                    continue  # adding/removing lines isn't supported through this endpoint
                if "selling_price" in item_data:
                    item.selling_price = item_data["selling_price"]
                if "discount" in item_data:
                    item.discount = item_data["discount"]
                item.save(update_fields=["selling_price", "discount"])
        return instance
