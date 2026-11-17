from django.db import transaction
from rest_framework import serializers

from returns_app.models import Return, ReturnCategory, ReturnPhoto
from returns_app.services import set_return_outcome


class ReturnCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnCategory
        fields = ("id", "name", "created_at")
        read_only_fields = ("id", "created_at")


class ReturnPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnPhoto
        fields = ("id", "image")
        read_only_fields = ("id", "image")


class SaleItemLookupSerializer(serializers.Serializer):
    """Read-only shape for the return search — everything the spec says should
    'automatically load' once a phone is found."""

    id = serializers.UUIDField()
    imei = serializers.CharField()
    invoice_number = serializers.CharField(source="sale.invoice_number")
    customer_name = serializers.CharField(source="sale.customer_name")
    customer_phone = serializers.CharField(source="sale.customer_phone")
    category_name = serializers.CharField(source="stock_item.category.name")
    model_name = serializers.CharField(source="stock_item.model.name")
    sale_date = serializers.DateTimeField(source="sale.created_at")
    sold_by_name = serializers.SerializerMethodField()

    def get_sold_by_name(self, obj):
        return obj.sale.sold_by.get_full_name() or obj.sale.sold_by.username


class ReturnSerializer(serializers.ModelSerializer):
    photos = ReturnPhotoSerializer(many=True, read_only=True)
    imei = serializers.CharField(source="sale_item.imei", read_only=True)
    invoice_number = serializers.CharField(source="sale_item.sale.invoice_number", read_only=True)
    customer_name = serializers.CharField(source="sale_item.sale.customer_name", read_only=True)
    category_name = serializers.CharField(source="sale_item.stock_item.category.name", read_only=True)
    model_name = serializers.CharField(source="sale_item.stock_item.model.name", read_only=True)
    return_category_display = serializers.CharField(source="return_category.name", read_only=True)

    class Meta:
        model = Return
        fields = (
            "id",
            "sale_item",
            "imei",
            "invoice_number",
            "customer_name",
            "category_name",
            "model_name",
            "return_date",
            "return_category",
            "return_category_display",
            "description",
            "status",
            "outcome",
            "outcome_display",
            "processed_by",
            "photos",
            "created_at",
        )
        read_only_fields = ("id", "processed_by", "created_at")

    outcome_display = serializers.CharField(source="get_outcome_display", read_only=True)

    # The outcome isn't a plain field write: "back on sale" moves stock, so it goes through
    # set_return_outcome in the same transaction as the rest of the save.
    @transaction.atomic
    def create(self, validated_data):
        outcome = validated_data.pop("outcome", "")
        return_record = super().create(validated_data)
        set_return_outcome(return_record, outcome, self.context["request"].user)
        return return_record

    @transaction.atomic
    def update(self, instance, validated_data):
        outcome = validated_data.pop("outcome", instance.outcome)
        return_record = super().update(instance, validated_data)
        set_return_outcome(return_record, outcome, self.context["request"].user)
        return return_record

    def validate_sale_item(self, value):
        if (self.instance is None or self.instance.sale_item_id != value.pk) and (
            not value.is_active or value.sale.is_voided
        ):
            raise serializers.ValidationError("This phone isn't with a customer -- its sale was voided or it's back in stock.")
        conflicting = Return.objects.filter(sale_item=value, status__in=["pending", "processing"])
        if self.instance:
            conflicting = conflicting.exclude(pk=self.instance.pk)
        if conflicting.exists():
            raise serializers.ValidationError("This phone already has an open return in progress.")
        return value
