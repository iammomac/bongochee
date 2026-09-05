from django.db.models import Prefetch
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from activitylog.services import log_action
from rbac.permissions import HasPermission
from sales.models import Sale, SaleItem
from sales.serializers import SaleSerializer


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
