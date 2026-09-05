from django.urls import include, path
from rest_framework.routers import DefaultRouter

from stock.views import StockImportPreviewView, StockImportTemplateView, StockInViewSet, StockItemViewSet

app_name = "stock"
router = DefaultRouter()
router.register(r"stock-ins", StockInViewSet, basename="stock-ins")
router.register(r"stock-items", StockItemViewSet, basename="stock-items")

urlpatterns = [
    path("import-preview/", StockImportPreviewView.as_view(), name="stock-import-preview"),
    path("import-template/", StockImportTemplateView.as_view(), name="stock-import-template"),
    path("", include(router.urls)),
]
