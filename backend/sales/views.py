from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from activitylog.services import log_action
from rbac.permissions import HasPermission
from returns_app.models import Return
from sales.models import Sale, SaleItem
from sales.serializers import SaleSerializer
from stock.services import return_units_to_stock


class SaleViewSet(viewsets.ModelViewSet):
    queryset = (
        Sale.objects.select_related("sold_by", "voided_by")
        .prefetch_related(
            Prefetch("items", queryset=SaleItem.objects.select_related("stock_item__model", "stock_item__category"))
        )
        .all()
    )
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "create_sales"

    # No DELETE: a sale is voided (POST .../void/), never erased.
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "void":
            self.required_permission = "delete_sales"
        elif self.action in ("update", "partial_update"):
            self.required_permission = "edit_sales"
        else:
            self.required_permission = "create_sales"
        return super().get_permissions()

    def perform_create(self, serializer):
        sale = serializer.save()
        log_action(user=self.request.user, action="sale.create", request=self.request, invoice=sale.invoice_number)

    def perform_update(self, serializer):
        sale = serializer.save()
        log_action(user=self.request.user, action="sale.update", request=self.request, invoice=sale.invoice_number)

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request, pk=None):
        """Undo a sale entered by mistake. The record stays (marked voided, with who/when/why),
        its phones go back into stock and their IMEIs are freed, and it drops out of every
        total and report."""
        reason = " ".join((request.data.get("reason") or "").split())
        if not reason:
            raise ValidationError({"detail": "Say why this sale is being voided."})

        with transaction.atomic():
            # Locked so two people voiding at once can't both put the stock back.
            sale = Sale.objects.select_for_update().get(pk=self.get_object().pk)
            if sale.is_voided:
                raise ValidationError({"detail": "This sale is already voided."})
            if Return.objects.filter(sale_item__sale=sale).exists():
                raise ValidationError(
                    {"detail": "A return is recorded against this sale -- handle the phone from the Returns page instead."}
                )
            for item in sale.items.filter(is_active=True):
                return_units_to_stock(
                    item.stock_item_id, "sale_voided", user=request.user, reference=sale.invoice_number, note=reason
                )
            sale.items.update(is_active=False)
            sale.voided_at = timezone.now()
            sale.voided_by = request.user
            sale.void_reason = reason
            sale.save(update_fields=["voided_at", "voided_by", "void_reason"])
            log_action(user=request.user, action="sale.void", request=request, invoice=sale.invoice_number, reason=reason)

        return Response(self.get_serializer(self.get_queryset().get(pk=sale.pk)).data)
