from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from rbac.permissions import HasPermission
from suppliers.models import Supplier
from suppliers.serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "manage_suppliers"
    search_fields = ["name"]

    def get_permissions(self):
        # Anyone entering stock (or building a report) needs to be able to pick a
        # supplier, even without manage_suppliers — write actions stay restricted.
        self.required_permission = (
            ("add_stock", "manage_suppliers", "view_reports")
            if self.action in ("list", "retrieve")
            else "manage_suppliers"
        )
        return super().get_permissions()
