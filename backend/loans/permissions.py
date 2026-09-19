from rest_framework.permissions import BasePermission

from rbac.permissions import user_has_permission

# Holding any one of these means you work with loan sales -- enough to see how the loan
# book is doing (the charts, the loan sales report). Loan data stays admin/super-only by
# default because none of these are in any default role but Admin's.
ANY_LOAN_PERMISSION = ("create_loan_sales", "edit_loan_sales", "delete_loan_sales", "record_loan_payments")


class HasAnyLoanPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and any(user_has_permission(user, code) for code in ANY_LOAN_PERMISSION))
