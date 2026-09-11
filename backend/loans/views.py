from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from activitylog.services import log_action
from loans.models import LoanPayment, LoanSale, LoanSaleItem
from loans.serializers import LoanPaymentSerializer, LoanSaleSerializer
from rbac.permissions import HasPermission


class LoanSaleViewSet(viewsets.ModelViewSet):
    queryset = (
        LoanSale.objects.select_related("sold_by")
        .prefetch_related(
            Prefetch("items", queryset=LoanSaleItem.objects.select_related("stock_item__model", "stock_item__category")),
            Prefetch("payments", queryset=LoanPayment.objects.select_related("recorded_by")),
        )
        .all()
    )
    serializer_class = LoanSaleSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "create_loan_sales"

    def get_permissions(self):
        if self.action == "destroy":
            self.required_permission = "delete_loan_sales"
        elif self.action in ("update", "partial_update"):
            self.required_permission = "edit_loan_sales"
        elif self.action == "add_payment":
            self.required_permission = "record_loan_payments"
        elif self.action == "remove_payment":
            self.required_permission = "delete_loan_sales"
        else:
            self.required_permission = "create_loan_sales"
        return super().get_permissions()

    def perform_create(self, serializer):
        loan_sale = serializer.save()
        log_action(user=self.request.user, action="loan_sale.create", request=self.request, invoice=loan_sale.invoice_number)

    def perform_update(self, serializer):
        loan_sale = serializer.save()
        log_action(user=self.request.user, action="loan_sale.update", request=self.request, invoice=loan_sale.invoice_number)

    def perform_destroy(self, instance):
        # Same reasoning as undoing a regular sale -- give the stock back -- plus a
        # guard regular sales don't need: real money may already be recorded here,
        # and silently deleting that history would just make it vanish.
        if instance.payments.exists():
            raise ValidationError({"detail": "Can't delete -- payments have already been recorded against this loan."})
        for item in instance.items.select_related("stock_item"):
            stock_item = item.stock_item
            stock_item.quantity_remaining += 1
            stock_item.save(update_fields=["quantity_remaining"])
        log_action(user=self.request.user, action="loan_sale.delete", request=self.request, invoice=instance.invoice_number)
        instance.delete()

    @action(detail=True, methods=["post"], url_path="payments")
    def add_payment(self, request, pk=None):
        loan_sale = self.get_object()
        serializer = LoanPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(loan_sale=loan_sale, recorded_by=request.user)
        log_action(
            user=request.user,
            action="loan_sale.payment",
            request=request,
            invoice=loan_sale.invoice_number,
            amount=str(payment.amount),
        )
        # Re-fetch: loan_sale's `.payments` prefetch was cached before this payment
        # existed, so serializing it directly would total up a stale (short) list.
        loan_sale = self.get_queryset().get(pk=loan_sale.pk)
        return Response(LoanSaleSerializer(loan_sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"payments/(?P<payment_id>[^/.]+)")
    def remove_payment(self, request, pk=None, payment_id=None):
        loan_sale = self.get_object()
        # .filter() on a related manager always hits the DB fresh, unlike .all()
        # which would return the (already-cached) prefetched list.
        payment = loan_sale.payments.filter(id=payment_id).first()
        if payment is None:
            return Response({"detail": "Payment not found"}, status=status.HTTP_404_NOT_FOUND)
        log_action(
            user=request.user,
            action="loan_sale.payment_delete",
            request=request,
            invoice=loan_sale.invoice_number,
            amount=str(payment.amount),
        )
        payment.delete()
        loan_sale = self.get_queryset().get(pk=loan_sale.pk)
        return Response(LoanSaleSerializer(loan_sale).data)
