from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from catalog.models import Category, PhoneModel
from catalog.serializers import CategorySerializer, PhoneModelSerializer
from catalog.services import get_or_create_category, get_or_create_model
from rbac.permissions import HasPermission


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "add_stock"
    search_fields = ["name"]

    def get_permissions(self):
        # Reports needs to populate a category filter dropdown without add_stock.
        self.required_permission = ("add_stock", "view_reports") if self.action in ("list", "retrieve") else "add_stock"
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)
        instance, created = get_or_create_category(name)
        return Response(
            CategorySerializer(instance).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "This category has models or stock linked to it and can't be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class PhoneModelViewSet(viewsets.ModelViewSet):
    queryset = PhoneModel.objects.select_related("category").all()
    serializer_class = PhoneModelSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "add_stock"
    filterset_fields = ["category"]
    search_fields = ["name"]

    def get_permissions(self):
        self.required_permission = ("add_stock", "view_reports") if self.action in ("list", "retrieve") else "add_stock"
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        name = (request.data.get("name") or "").strip()
        category_id = request.data.get("category")
        if not name or not category_id:
            return Response({"detail": "Category and name are required"}, status=status.HTTP_400_BAD_REQUEST)
        category = Category.objects.filter(id=category_id).first()
        if not category:
            return Response({"detail": "Category not found"}, status=status.HTTP_400_BAD_REQUEST)
        instance, created = get_or_create_model(category, name)
        return Response(
            PhoneModelSerializer(instance).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "This model has stock linked to it and can't be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
