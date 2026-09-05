from rest_framework import serializers

from returns_app.models import Return, ReturnPhoto


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
    return_category_display = serializers.CharField(source="get_return_category_display", read_only=True)

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
            "processed_by",
            "photos",
            "created_at",
        )
        read_only_fields = ("id", "processed_by", "created_at")

    def validate_sale_item(self, value):
        conflicting = Return.objects.filter(sale_item=value, status__in=["pending", "processing"])
        if self.instance:
            conflicting = conflicting.exclude(pk=self.instance.pk)
        if conflicting.exists():
            raise serializers.ValidationError("This phone already has an open return in progress.")
        return value
