from django.urls import path

from reports.views import (
    DashboardSummaryView,
    FullBackupExportView,
    LossReportView,
    PersonReportView,
    ReturnsSummaryView,
    SalesSummaryView,
    StockSummaryView,
    SupplierSummaryView,
)

app_name = "reports"
urlpatterns = [
    path("dashboard-summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("sales-summary/", SalesSummaryView.as_view(), name="sales-summary"),
    path("returns-summary/", ReturnsSummaryView.as_view(), name="returns-summary"),
    path("stock-summary/", StockSummaryView.as_view(), name="stock-summary"),
    path("supplier-summary/", SupplierSummaryView.as_view(), name="supplier-summary"),
    path("loss/", LossReportView.as_view(), name="loss-report"),
    path("person/<uuid:user_id>/", PersonReportView.as_view(), name="person-report"),
    path("full-backup/", FullBackupExportView.as_view(), name="full-backup"),
]
