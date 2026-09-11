from decimal import Decimal

from rest_framework import serializers

from loans.models import LoanPayment, LoanSale, LoanSaleItem
from notifications.services import notify_permission_holders
from sales.models import SaleItem
from stock.models import LOW_STOCK_THRESHOLD, StockItem


class LoanSaleItemSerializer(serializers.ModelSerializer):
    # Writable, same reasoning as SaleItemSerializer.id -- an edit payload needs to
    # say which existing line it's touching.
    id = serializers.UUIDField(required=False)
    imei = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    model_name = serializers.CharField(source="stock_item.model.name", read_only=True)
    category_name = serializers.CharField(source="stock_item.category.name", read_only=True)

    class Meta:
        model = LoanSaleItem
        fields = ("id", "stock_item", "model_name", "category_name", "imei", "selling_price", "discount")

    def validate_imei(self, value):
        return value or None


class LoanPaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LoanPayment
        fields = (
            "id", "amount", "payment_method", "paid_date", "notes",
            "recorded_by", "recorded_by_name", "created_at",
        )
        read_only_fields = ("id", "recorded_by", "recorded_by_name", "created_at")

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() or obj.recorded_by.username

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value


class LoanSaleSerializer(serializers.ModelSerializer):
    items = LoanSaleItemSerializer(many=True, required=False)
    payments = LoanPaymentSerializer(many=True, read_only=True)
    sold_by_name = serializers.SerializerMethodField()
    total_owed = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    loan_status = serializers.SerializerMethodField()

    class Meta:
        model = LoanSale
        fields = (
            "id",
            "invoice_number",
            "business_name",
            "contact_person",
            "contact_phone",
            "notes",
            "items",
            "payments",
            "sold_by",
            "sold_by_name",
            "total_owed",
            "total_paid",
            "balance",
            "loan_status",
            "created_at",
        )
        read_only_fields = ("id", "sold_by", "sold_by_name", "created_at")

    def get_sold_by_name(self, obj):
        return obj.sold_by.get_full_name() or obj.sold_by.username

    # obj.items/.payments are prefetched on the viewset's queryset, so .all() here
    # reuses that cache instead of hitting the DB again per field.
    def _totals(self, obj):
        owed = sum((item.selling_price - item.discount for item in obj.items.all()), Decimal("0"))
        paid = sum((payment.amount for payment in obj.payments.all()), Decimal("0"))
        return owed, paid

    def get_total_owed(self, obj):
        owed, _paid = self._totals(obj)
        return owed

    def get_total_paid(self, obj):
        _owed, paid = self._totals(obj)
        return paid

    def get_balance(self, obj):
        owed, paid = self._totals(obj)
        return owed - paid

    def get_loan_status(self, obj):
        owed, paid = self._totals(obj)
        if owed > 0 and paid >= owed:
            return "paid"
        if paid > 0:
            return "partial"
        return "open"

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        # A phone can only ever belong to one sale -- checked against both the
        # regular and loan sale tables so the same IMEI can't be recorded twice
        # across either sale type.
        seen_imeis = set()
        for item_data in items_data:
            imei = item_data.get("imei")
            if imei:
                if (
                    imei in seen_imeis
                    or SaleItem.objects.filter(imei=imei).exists()
                    or LoanSaleItem.objects.filter(imei=imei).exists()
                ):
                    raise serializers.ValidationError({"detail": f"IMEI {imei} is already recorded against another sale"})
                seen_imeis.add(imei)

        loan_sale = LoanSale.objects.create(**validated_data, sold_by=self.context["request"].user)
        for item_data in items_data:
            stock_item = StockItem.objects.get(id=item_data["stock_item"].id)
            if stock_item.quantity_remaining < 1:
                raise serializers.ValidationError({"detail": f"{stock_item} is out of stock"})
            previous_remaining = stock_item.quantity_remaining
            stock_item.quantity_remaining -= 1
            stock_item.save(update_fields=["quantity_remaining"])
            LoanSaleItem.objects.create(loan_sale=loan_sale, **item_data)

            new_remaining = stock_item.quantity_remaining
            if previous_remaining > 0 and new_remaining == 0:
                notify_permission_holders(
                    "add_stock",
                    "out_of_stock",
                    title=f"{stock_item} is out of stock",
                    message=f"{stock_item} sold out after this loan sale.",
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
        return loan_sale

    def update(self, instance, validated_data):
        # Business/contact/notes are freely editable. Item price/discount edits are
        # only safe before any payment exists -- changing what's owed after a
        # business has already paid against the old total would desync the balance.
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            if instance.payments.exists():
                raise serializers.ValidationError(
                    {"detail": "Can't change item prices -- payments have already been recorded against this loan."}
                )
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
