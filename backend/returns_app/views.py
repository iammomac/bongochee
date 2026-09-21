from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db.models import Q, Value
from django.db.models.functions import Concat, Lower, Replace
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activitylog.services import log_action
from config.validators import ALLOWED_IMAGE_EXTENSIONS, validate_image_size
from notifications.services import notify_permission_holders
from rbac.permissions import HasPermission
from returns_app.models import Return, ReturnCategory, ReturnPhoto
from returns_app.serializers import (
    ReturnCategorySerializer,
    ReturnPhotoSerializer,
    ReturnSerializer,
    SaleItemLookupSerializer,
)
from returns_app.services import get_or_create_return_category
from sales.models import SaleItem

# A popular model can have dozens of sales, and the person picks the customer from the list.
LOOKUP_RESULT_LIMIT = 30


def _squash(text):
    """Lower-case with spaces and dashes dropped, so "s23u" and "S23 Ultra" compare equal."""
    return text.lower().replace(" ", "").replace("-", "")


class SaleItemLookupView(APIView):
    """Search a sold phone by IMEI, invoice number, customer (name or phone), or the phone's
    brand/model — the entry point for filing a return, per the spec's 'search then auto-load'
    flow. Typing a model ("s23 ultra") lists every one sold, so the customer can be picked
    from the list."""

    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "create_returns"

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response([])

        # Every word must match somewhere ("s23 juma" = an S23 sold to a Juma) ...
        by_words = Q()
        for word in query.split():
            by_words &= (
                Q(imei__icontains=word)
                | Q(sale__invoice_number__icontains=word)
                | Q(sale__customer_name__icontains=word)
                | Q(sale__customer_phone__icontains=word)
                | Q(stock_item__category__name__icontains=word)
                | Q(stock_item__model__name__icontains=word)
            )
        # ... or the whole query, spacing aside, is part of "<brand> <model>" ("s23u", "samsungs23").
        squashed = _squash(query)
        by_name = Q(name_key__contains=squashed) if squashed else Q()

        matches = (
            SaleItem.objects.annotate(
                name_key=Lower(
                    Replace(
                        Replace(Concat("stock_item__category__name", "stock_item__model__name"), Value(" "), Value("")),
                        Value("-"),
                        Value(""),
                    )
                )
            )
            .filter(by_words | by_name)
            .select_related("sale__sold_by", "stock_item__category", "stock_item__model")
            .order_by("-sale__created_at")[:LOOKUP_RESULT_LIMIT]
        )
        return Response(SaleItemLookupSerializer(matches, many=True).data)


class ReturnCategoryViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """The kinds of fault a return can be filed under. Listing is what the picker searches;
    creating is get-or-create by name, so adding one that already exists (in any letter case)
    just returns it."""

    queryset = ReturnCategory.objects.all()
    serializer_class = ReturnCategorySerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = ("create_returns", "edit_returns")
    search_fields = ["name"]

    def create(self, request, *args, **kwargs):
        name = " ".join((request.data.get("name") or "").split())
        if not name:
            return Response({"detail": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)
        max_length = ReturnCategory._meta.get_field("name").max_length
        if len(name) > max_length:
            return Response(
                {"detail": f"Keep the name to {max_length} characters or fewer."}, status=status.HTTP_400_BAD_REQUEST
            )
        category, created = get_or_create_return_category(name)
        if created:
            log_action(user=request.user, action="return_category.create", request=request, name=category.name)
        return Response(
            ReturnCategorySerializer(category).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ReturnViewSet(viewsets.ModelViewSet):
    queryset = (
        Return.objects.select_related(
            "sale_item__sale__sold_by",
            "sale_item__stock_item__category",
            "sale_item__stock_item__model",
            "processed_by",
            "return_category",
        )
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
                f"(IMEI {return_record.sale_item.imei}) — {return_record.return_category.name}"
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
