from datetime import date, timedelta

from django.db.models import F, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import PasswordChangeRequest, User
from activitylog.services import log_action
from rbac.permissions import HasPermission, IsAdminOrSuper
from reports import services
from reports.exports import multi_sheet_xlsx, rows_to_pdf, rows_to_xlsx
from reports.serializers import DashboardSummarySerializer
from returns_app.models import Return
from sales.models import Sale, SaleItem
from stock.models import LOW_STOCK_THRESHOLD, StockItem

REVENUE_TREND_DAYS = 14


def _revenue_trend(today):
    window_start = today - timedelta(days=REVENUE_TREND_DAYS - 1)
    daily = (
        SaleItem.objects.filter(sale__created_at__date__gte=window_start, sale__created_at__date__lte=today)
        .annotate(day=TruncDate("sale__created_at"))
        .values("day")
        .annotate(revenue=Sum(F("selling_price") - F("discount")), cost=Sum("stock_item__buying_price"))
    )
    by_day = {row["day"]: row for row in daily}
    trend = []
    for offset in range(REVENUE_TREND_DAYS):
        day = window_start + timedelta(days=offset)
        row = by_day.get(day)
        revenue = row["revenue"] if row else 0
        cost = row["cost"] if row else 0
        trend.append({"date": day, "revenue": revenue or 0, "profit": (revenue or 0) - (cost or 0)})
    return trend


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "view_dashboard"

    def get(self, request):
        today = timezone.localdate()
        sales_today = Sale.objects.filter(created_at__date=today)
        sale_items_today = SaleItem.objects.filter(sale__created_at__date=today)
        profit_today = sum(item.selling_price - item.discount for item in sale_items_today) - sum(
            item.stock_item.buying_price for item in sale_items_today
        )
        summary = {
            "todays_sales": sales_today.count(),
            "todays_profit": profit_today,
            "todays_returns": Return.objects.filter(created_at__date=today).count(),
            "remaining_stock": StockItem.objects.aggregate(total=Sum("quantity_remaining"))["total"] or 0,
            "total_stock_value": StockItem.objects.aggregate(total=Sum("buying_price"))["total"] or 0,
            "low_stock": StockItem.objects.filter(quantity_remaining__lte=LOW_STOCK_THRESHOLD).count(),
            "out_of_stock": StockItem.objects.filter(quantity_remaining=0).count(),
            "pending_returns": Return.objects.filter(status__in=["pending", "processing"]).count(),
            "pending_password_requests": PasswordChangeRequest.objects.filter(status="pending").count(),
            "revenue_trend": _revenue_trend(today),
        }
        serializer = DashboardSummarySerializer(summary)
        log_action(user=request.user, action="report.dashboard", request=request)
        return Response(serializer.data)


def _user_has_permission(user, codename):
    if user.is_superuser or (user.role and user.role.is_system_role):
        return True
    if not user.role:
        return False
    return user.role.permissions.filter(codename=codename).exists()


def _parse_date(value, default):
    if not value:
        return default
    return date.fromisoformat(value)


def _date_range(request):
    today = timezone.localdate()
    date_from = _parse_date(request.query_params.get("date_from"), today)
    date_to = _parse_date(request.query_params.get("date_to"), today)
    return date_from, date_to


def _filters(request):
    params = request.query_params
    return {
        "category": params.get("category") or None,
        "model": params.get("model") or None,
        "supplier": params.get("supplier") or None,
        "user": params.get("user") or None,
        "payment_method": params.get("payment_method") or None,
    }


class BaseReportView(APIView):
    """Every concrete report view just supplies build_report(); viewing (JSON),
    permission-based field stripping, and Excel/PDF export are handled once here."""

    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "view_reports"
    export_filename = "report"
    profit_fields = ()  # field keys stripped from columns/rows/totals without view_profit
    requires_view_profit = False  # True for reports that are entirely profit/cost data
    # Same idea for the detail table -- kept separate since its keys differ
    # (e.g. buying_price and stock_value only exist there).
    detail_profit_fields = ()
    # Detail columns that get a grand-total row at the bottom.
    detail_sum_keys = ()

    def build_report(self, request):
        """Returns (columns, rows, totals): columns = [(key, label), ...] used for
        export headers; rows = list of dicts (returned as-is for JSON, projected
        through columns for export); totals = dict or None."""
        raise NotImplementedError

    def build_details(self, request):
        """Optional: (columns, rows) for the full per-transaction table shown under
        the grouped summary, or None when the report's own rows already are the
        transaction list."""
        return None

    def get(self, request, *args, **kwargs):
        if self.requires_view_profit and not _user_has_permission(request.user, "view_profit"):
            return Response(
                {"detail": "You do not have permission to view profit data."},
                status=status.HTTP_403_FORBIDDEN,
            )

        export_format = request.query_params.get("export")
        if export_format and not _user_has_permission(request.user, "export_reports"):
            return Response(
                {"detail": "You do not have permission to export reports."},
                status=status.HTTP_403_FORBIDDEN,
            )

        can_view_profit = _user_has_permission(request.user, "view_profit")
        columns, rows, totals = self.build_report(request)

        if self.profit_fields and not can_view_profit:
            columns = [(key, label) for key, label in columns if key not in self.profit_fields]
            rows = [{k: v for k, v in row.items() if k not in self.profit_fields} for row in rows]
            if totals:
                totals = {k: v for k, v in totals.items() if k not in self.profit_fields}

        detail_columns, detail_rows, detail_totals = None, None, None
        built_details = self.build_details(request)
        if built_details is not None:
            detail_columns, detail_rows = built_details
            if self.detail_profit_fields and not can_view_profit:
                detail_columns = [(key, label) for key, label in detail_columns if key not in self.detail_profit_fields]
                detail_rows = [{k: v for k, v in row.items() if k not in self.detail_profit_fields} for row in detail_rows]
            detail_totals = {
                key: sum((row.get(key) or 0 for row in detail_rows), 0)
                for key, _ in detail_columns
                if key in self.detail_sum_keys
            }

        if export_format in ("xlsx", "pdf"):
            headers = [label for _, label in columns]
            data_rows = [[row.get(key) for key, _ in columns] for row in rows]
            detail = None
            if detail_columns is not None:
                detail = {
                    "headers": [label for _, label in detail_columns],
                    "rows": [[row.get(key) for key, _ in detail_columns] for row in detail_rows],
                    # Label sits in the first column; sums line up under their own columns.
                    "total_row": ["Total"] + [detail_totals.get(key, "") for key, _ in detail_columns[1:]],
                }
            if export_format == "xlsx":
                return rows_to_xlsx(self.export_filename, headers, data_rows, detail)
            return rows_to_pdf(
                self.export_filename, self.export_filename.replace("_", " ").title(), headers, data_rows, detail
            )

        payload = {"rows": rows}
        if totals is not None:
            payload["totals"] = totals
        if detail_rows is not None:
            payload["details"] = detail_rows
            payload["detail_totals"] = detail_totals
        return Response(payload)


class SalesSummaryView(BaseReportView):
    """Daily / Weekly / Monthly / Profit / Brand / Model / User reports — all this
    endpoint with a different group_by and date range."""

    export_filename = "sales_report"
    profit_fields = ("profit",)
    detail_profit_fields = ("profit",)
    detail_sum_keys = ("units", "price_sold", "discount", "revenue", "profit")

    def build_report(self, request):
        date_from, date_to = _date_range(request)
        group_by = request.query_params.get("group_by", "day")
        filters = _filters(request)
        rows = services.sales_rows(date_from, date_to, group_by=group_by, **filters)
        totals = services.sales_totals(date_from, date_to, **filters)
        columns = [
            ("label", "Period" if group_by == "day" else group_by.replace("_", " ").title()),
            ("units", "Units"),
            ("revenue", "Revenue"),
            ("profit", "Profit"),
        ]
        return columns, rows, totals

    def build_details(self, request):
        date_from, date_to = _date_range(request)
        rows = services.sales_detail_rows(date_from, date_to, **_filters(request))
        columns = [
            ("date", "Date"),
            ("time", "Time"),
            ("invoice_number", "Invoice"),
            ("sold_by_name", "Salesperson"),
            ("customer_name", "Customer"),
            ("category_name", "Category"),
            ("model_name", "Model"),
            ("supplier_name", "Supplier"),
            ("units", "Units"),
            ("price_sold", "Price Sold"),
            ("discount", "Discount"),
            ("revenue", "Revenue"),
            ("profit", "Profit"),
            ("condition", "Condition"),
            ("sale_notes", "Sale Notes"),
        ]
        return columns, rows


class ReturnsSummaryView(BaseReportView):
    export_filename = "returns_report"
    detail_profit_fields = ("profit",)
    detail_sum_keys = ("units", "price_sold", "revenue", "profit")

    def build_report(self, request):
        date_from, date_to = _date_range(request)
        group_by = request.query_params.get("group_by", "category")
        filters = _filters(request)
        rows = services.returns_rows(
            date_from, date_to, group_by=group_by, category=filters["category"], model=filters["model"], user=filters["user"]
        )
        columns = [("label", group_by.title()), ("count", "Count")]
        return columns, rows, None

    def build_details(self, request):
        date_from, date_to = _date_range(request)
        filters = _filters(request)
        rows = services.returns_detail_rows(
            date_from, date_to, category=filters["category"], model=filters["model"], user=filters["user"]
        )
        columns = [
            ("date", "Return Date"),
            ("time", "Time"),
            ("invoice_number", "Invoice"),
            ("processed_by_name", "Processed By"),
            ("customer_name", "Customer"),
            ("category_name", "Category"),
            ("model_name", "Model"),
            ("supplier_name", "Supplier"),
            ("units", "Units"),
            ("price_sold", "Price Sold"),
            ("revenue", "Revenue"),
            ("profit", "Profit"),
            ("condition", "Condition"),
            ("issue", "Issue"),
            ("status", "Status"),
            ("description", "Description"),
        ]
        return columns, rows


STOCK_DETAIL_COLUMNS = [
    ("date", "Date Added"),
    ("time", "Time"),
    ("added_by_name", "Added By"),
    ("supplier_name", "Supplier"),
    ("category_name", "Category"),
    ("model_name", "Model"),
    ("quantity", "Qty Imported"),
    ("quantity_remaining", "Qty Remaining"),
    ("units_sold", "Units Sold"),
    ("buying_price", "Buying Price"),
    ("stock_value", "Stock Value"),
    ("revenue", "Revenue"),
    ("profit", "Profit"),
    ("condition", "Condition"),
]


class StockSummaryView(BaseReportView):
    export_filename = "stock_report"
    profit_fields = ("value",)
    detail_profit_fields = ("buying_price", "stock_value", "profit")
    detail_sum_keys = ("quantity", "quantity_remaining", "units_sold", "stock_value", "revenue", "profit")

    def build_report(self, request):
        group_by = request.query_params.get("group_by", "category")
        filters = _filters(request)
        rows = services.stock_rows(
            group_by=group_by, category=filters["category"], model=filters["model"], supplier=filters["supplier"]
        )
        columns = [("label", group_by.title()), ("quantity", "Quantity"), ("value", "Stock Value")]
        return columns, rows, None

    def build_details(self, request):
        filters = _filters(request)
        rows = services.stock_detail_rows(
            category=filters["category"], model=filters["model"], supplier=filters["supplier"]
        )
        return STOCK_DETAIL_COLUMNS, rows


class SupplierSummaryView(BaseReportView):
    export_filename = "supplier_report"
    profit_fields = ("value",)
    detail_profit_fields = ("buying_price", "stock_value", "profit")
    detail_sum_keys = ("quantity", "quantity_remaining", "units_sold", "stock_value", "revenue", "profit")

    def build_report(self, request):
        date_from, date_to = _date_range(request)
        filters = _filters(request)
        rows = services.supplier_rows(date_from, date_to, supplier=filters["supplier"])
        columns = [("label", "Supplier"), ("quantity", "Quantity Imported"), ("value", "Stock Value")]
        return columns, rows, None

    def build_details(self, request):
        date_from, date_to = _date_range(request)
        rows = services.stock_detail_rows(
            supplier=_filters(request)["supplier"], date_from=date_from, date_to=date_to
        )
        return STOCK_DETAIL_COLUMNS, rows


class LossReportView(BaseReportView):
    export_filename = "loss_report"
    requires_view_profit = True

    def build_report(self, request):
        date_from, date_to = _date_range(request)
        filters = _filters(request)
        rows = services.loss_rows(date_from, date_to, **filters)
        columns = [
            ("date", "Date"),
            ("time", "Time"),
            ("invoice_number", "Invoice"),
            ("sold_by_name", "Salesperson"),
            ("customer_name", "Customer"),
            ("category_name", "Category"),
            ("model_name", "Model"),
            ("supplier_name", "Supplier"),
            ("imei", "IMEI"),
            ("units", "Units"),
            ("price_sold", "Price Sold"),
            ("discount", "Discount"),
            ("net_price", "Revenue"),
            ("buying_price", "Buying Price"),
            ("min_selling_price", "Min Price"),
            ("profit", "Profit"),
            ("loss_type_display", "Loss Type"),
            ("condition", "Condition"),
            ("sale_notes", "Sale Notes"),
        ]
        return columns, rows, None


class PersonReportView(APIView):
    """Admin picks an employee and sees their stock/sales/returns stat block for a
    date range — the activity timeline itself reuses the existing ActivityLogViewSet
    (GET /api/v1/logs/?user=<id>), not a new endpoint."""

    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "manage_users"

    def get(self, request, user_id):
        target_user = get_object_or_404(User, id=user_id)
        date_from, date_to = _date_range(request)
        data = services.person_report(target_user, date_from, date_to)
        if not _user_has_permission(request.user, "view_profit"):
            data["sales_made"].pop("profit", None)
            data["stock_added"].pop("value", None)
        return Response(data)


class FullBackupExportView(APIView):
    """Full-system data export for offline backup / disaster recovery — deliberately
    gated tighter than the per-report exports above (which key off export_reports):
    this covers everything, including user accounts and the audit log, so it's
    admin/super only regardless of what any custom role is permissioned with."""

    permission_classes = [IsAuthenticated, IsAdminOrSuper]

    def get(self, request):
        sheets = services.full_backup_sheets()
        log_action(user=request.user, action="report.full_backup_export", request=request)
        filename = f"bongochee_backup_{timezone.localdate().isoformat()}"
        return multi_sheet_xlsx(filename, sheets)
