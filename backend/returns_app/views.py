from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activitylog.services import log_action
from config.validators import ALLOWED_IMAGE_EXTENSIONS, validate_image_size
from notifications.services import notify_permission_holders
from rbac.permissions import HasPermission
from returns_app.models import Return, ReturnPhoto
from returns_app.serializers import ReturnPhotoSerializer, ReturnSerializer, SaleItemLookupSerializer
from sales.models import SaleItem

LOOKUP_RESULT_LIMIT = 10


class SaleItemLookupView(APIView):
    """Search a sold phone by IMEI, invoice number, or customer name — the entry
    point for filing a return, per the spec's 'search then auto-load' flow."""

    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "create_returns"

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response([])
        matches = (
            SaleItem.objects.filter(
                Q(imei__icontains=query)
                | Q(sale__invoice_number__icontains=query)
                | Q(sale__customer_name__icontains=query)
            )
            .select_related("sale__sold_by", "stock_item__category", "stock_item__model")
            .order_by("-sale__created_at")[:LOOKUP_RESULT_LIMIT]
        )
        return Response(SaleItemLookupSerializer(matches, many=True).data)


class ReturnViewSet(viewsets.ModelViewSet):
    queryset = (
        Return.objects.select_related("sale_item__sale__sold_by", "sale_item__stock_item__category", "sale_item__stock_item__model", "processed_by")
        .prefetch_related("photos")
        .all()
    )
    serializer_class = ReturnSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "create_returns"

    def get_permissions(self):
        self.required_permission = "edit_returns" if self.action in ("update", "partial_update") else "create_returns"
        return super().get_permissions()

    def perform_create(self, serializer):
        return_record = serializer.save(processed_by=self.request.user)
        log_action(user=self.request.user, action="return.create", request=self.request, return_id=str(return_record.id))
        stock_item = return_record.sale_item.stock_item
        notify_permission_holders(
            ["manage_users", "create_returns"],
            "new_return",
            title="New return filed",
            message=(
                f"{stock_item.category.name} {stock_item.model.name} "
                f"(IMEI {return_record.sale_item.imei}) — {return_record.get_return_category_display()}"
            ),
            link="/returns",
            exclude_user=self.request.user,
        )

    def perform_update(self, serializer):
        return_record = serializer.save()
        log_action(
            user=self.request.user,
            action="return.update",
            request=self.request,
            return_id=str(return_record.id),
            status=return_record.status,
        )

    @action(detail=True, methods=["post"], url_path="photos", parser_classes=[MultiPartParser])
    def add_photo(self, request, pk=None):
        return_record = self.get_object()
        image = request.FILES.get("image")
        if not image:
            return Response({"detail": "No image uploaded"}, status=status.HTTP_400_BAD_REQUEST)
        # ReturnPhoto.image declares these same validators, but model-field validators
        # only run through full_clean() (a ModelForm, or calling it explicitly) -- never
        # on plain .objects.create() -- so they're enforced by hand here instead.
        try:
            validate_image_size(image)
            FileExtensionValidator(ALLOWED_IMAGE_EXTENSIONS)(image)
        except ValidationError as exc:
            return Response({"detail": exc.messages[0]}, status=status.HTTP_400_BAD_REQUEST)
        photo = ReturnPhoto.objects.create(return_record=return_record, image=image)
        return Response(
            ReturnPhotoSerializer(photo, context={"request": request}).data, status=status.HTTP_201_CREATED
        )
