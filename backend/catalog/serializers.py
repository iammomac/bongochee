from rest_framework import serializers

from catalog.models import Category, PhoneModel


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "created_at")
        read_only_fields = ("id", "created_at")


class PhoneModelSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())

    class Meta:
        model = PhoneModel
        fields = ("id", "category", "name", "created_at")
        read_only_fields = ("id", "created_at")
