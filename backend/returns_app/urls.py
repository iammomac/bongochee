from django.urls import include, path
from rest_framework.routers import DefaultRouter

from returns_app.views import ReturnCategoryViewSet, ReturnViewSet, SaleItemLookupView

app_name = "returns_app"
router = DefaultRouter()
router.register(r"returns", ReturnViewSet, basename="returns")
router.register(r"categories", ReturnCategoryViewSet, basename="return-categories")

urlpatterns = [
    path("lookup/", SaleItemLookupView.as_view(), name="sale-item-lookup"),
    path("", include(router.urls)),
]
