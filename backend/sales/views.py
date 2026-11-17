from django.db import transaction
from django.db.models import Prefetch
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from activitylog.services import log_action
from rbac.permissions import HasPermission
from sales.models import Sale, SaleItem
from sales.serializers import SaleSerializer
from stock.services import return_units_to_stock


class SaleViewSet(viewsets.ModelViewSet):
    queryset = (
        Sale.objects.select_related("sold_by")
        .prefetch_related(
            Prefetch("items", queryset=SaleItem.objects.select_related("stock_item__model", "stock_item__category"))
        )
        .all()
    )
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "create_sales"

    def get_permissions(self):
        if self.action == "destroy":
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

    def perform_destroy(self, instance):
        # Undoing a mistaken sale must put the phone(s) back into available stock --
        # the create path decrements quantity_remaining by one per item, so deleting
        # has to reverse that or the stock count stays permanently wrong.
        # One transaction, so a failure part-way can't leave stock returned for a sale that still exists.
        with transaction.atomic():
            for item in instance.items.all():
                return_units_to_stock(item.stock_item_id)
            log_action(user=self.request.user, action="sale.delete", request=self.request, invoice=instance.invoice_number)
            instance.delete()
