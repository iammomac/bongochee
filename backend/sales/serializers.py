from django.db import transaction
from rest_framework import serializers

from loans.models import LoanSaleItem
from notifications.services import notify_permission_holders
from sales.models import Sale, SaleItem
from stock.models import LOW_STOCK_THRESHOLD
from stock.services import lock_stock_items, take_one_from_stock


def imei_in_use(imei, exclude_sale_item=None):
    """True if a phone with this IMEI is currently sold -- on a live sale (not voided, not
    returned and put back on sale) or on a loan."""
    sold = SaleItem.objects.filter(imei=imei, is_active=True)
    if exclude_sale_item is not None:
        sold = sold.exclude(pk=exclude_sale_item.pk)
    return sold.exists() or LoanSaleItem.objects.filter(imei=imei).exists()


class SaleItemSerializer(serializers.ModelSerializer):
    # Writable (not the ModelSerializer PK default of read-only) so an edit payload can
    # identify which existing line to update — see SaleSerializer.update() below. Left
    # optional so the create flow (which never sends one) is unaffected.
    id = serializers.UUIDField(required=False)
    # Explicit field, no auto UniqueValidator: this is a nested list serializer with no
    # per-child instance, so DRF can't exclude "this row" from the uniqueness check —
    # editing a sale while echoing back its own unchanged IMEI would otherwise be
    # rejected as a false duplicate. SaleSerializer.create() below does its own
    # duplicate check instead, since it only ever runs for genuinely new items.
    imei = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    model_name = serializers.CharField(source="stock_item.model.name", read_only=True)
    category_name = serializers.CharField(source="stock_item.category.name", read_only=True)

    class Meta:
        model = SaleItem
        fields = ("id", "stock_item", "model_name", "category_name", "imei", "selling_price", "discount")

    def validate_imei(self, value):
        # Store "not on hand" as NULL, never "" -- a unique index treats every ""
        # as the same value (second blank sale would collide) but allows any number
        # of NULLs.
        return value or None


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
            "is_voided",
            "voided_at",
            "voided_by_name",
            "void_reason",
        )
        read_only_fields = (
            "id",
            "sold_by",
            "sold_by_name",
            "created_at",
            "is_voided",
            "voided_at",
            "voided_by_name",
            "void_reason",
        )

    is_voided = serializers.BooleanField(read_only=True)
    voided_by_name = serializers.SerializerMethodField()

    def get_sold_by_name(self, obj):
        return obj.sold_by.get_full_name() or obj.sold_by.username

    def get_voided_by_name(self, obj):
        if obj.voided_by is None:
            return ""
        return obj.voided_by.get_full_name() or obj.voided_by.username

    # All or nothing: if any phone in the sale fails (e.g. out of stock), the sale and every
    # stock decrement before it are rolled back -- no half-saved sale, no stock lost.
    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        # Checked up front, before anything is written: a raw DB-level duplicate
        # (the model's unique=True) would otherwise surface as an unhandled 500
        # instead of a clean validation error. Only ever runs for new items --
        # editing an existing sale goes through update() below, which never
        # touches imei -- so this can't collide with a sale's own unchanged IMEI.
        # Also checked against loan sales -- a phone handed over on credit can't
        # also be rung up here, even though the two live in separate tables.
        seen_imeis = set()
        for item_data in items_data:
            imei = item_data.get("imei")
            if imei:
                if imei in seen_imeis or imei_in_use(imei):
                    raise serializers.ValidationError({"detail": f"IMEI {imei} is already recorded against another sale"})
                seen_imeis.add(imei)

        stock = lock_stock_items(item_data["stock_item"].id for item_data in items_data)
        sale = Sale.objects.create(**validated_data, sold_by=self.context["request"].user)
        for item_data in items_data:
            # The locked, freshly-read row -- shared across items from the same batch, so
            # each iteration sees the decrements before it and overselling can't slip through.
            stock_item = stock[item_data["stock_item"].id]
            if stock_item.quantity_remaining < 1:
                raise serializers.ValidationError({"detail": f"{stock_item} is out of stock"})
            # The seller can bargain below the batch's min/max_selling_price (e.g. clearance) —
            # this is intentionally NOT a hard block. A sale whose net price (after discount)
            # lands below min_selling_price, or below buying_price, still goes through; it just
            # surfaces afterward on the Loss Report (see reports/services.py) so it's visible
            # rather than silently allowed.
            previous_remaining, new_remaining = take_one_from_stock(
                stock_item, "sale", user=sale.sold_by, reference=sale.invoice_number
            )
            SaleItem.objects.create(sale=sale, **item_data)

            # Fire exactly once per crossing — not on every subsequent sale of an
            # already-low/empty batch — by comparing the value just before this
            # decrement against just after it.
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

    @transaction.atomic
    def update(self, instance, validated_data):
        # Header fields (customer/payment/notes/invoice) are freely editable. Line
        # items are matched by id and only selling_price, discount and imei are ever
        # touched -- stock_item is intentionally ignored even if the client sends a
        # different one, since swapping the phone here would desync
        # StockItem.quantity_remaining (decremented once, at creation, in create()
        # above) from reality. The IMEI is only a label on the unit, so a typo in it
        # can be corrected, as long as it doesn't clash with another sold phone.
        if instance.is_voided:
            raise serializers.ValidationError({"detail": "This sale was voided and can't be edited."})
        items_data = validated_data.pop("items", None)
        items_by_id = {item.id: item for item in instance.items.all()}

        # Checked before anything is written, so a clash leaves the sale untouched.
        changes = []
        seen_imeis = set()
        for item_data in items_data or []:
            item = items_by_id.get(item_data.get("id"))
            if item is None:
                continue  # adding/removing lines isn't supported through this endpoint
            new_imei = item_data.get("imei") if "imei" in item_data else item.imei
            if new_imei != item.imei and new_imei:
                if new_imei in seen_imeis or imei_in_use(new_imei, exclude_sale_item=item):
                    raise serializers.ValidationError({"detail": f"IMEI {new_imei} is already recorded against another sale"})
            if new_imei:
                seen_imeis.add(new_imei)
            changes.append((item, item_data, new_imei))

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        for item, item_data, new_imei in changes:
            if "selling_price" in item_data:
                item.selling_price = item_data["selling_price"]
            if "discount" in item_data:
                item.discount = item_data["discount"]
            item.imei = new_imei
            item.save(update_fields=["selling_price", "discount", "imei"])
        return instance
