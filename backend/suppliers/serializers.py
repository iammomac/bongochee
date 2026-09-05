from rest_framework import serializers

from suppliers.models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ("id", "name", "phone", "address", "email", "notes", "created_at")
        read_only_fields = ("id", "created_at")
