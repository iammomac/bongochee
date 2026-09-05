from django.urls import include, path
from rest_framework.routers import DefaultRouter

from returns_app.views import ReturnViewSet, SaleItemLookupView

app_name = "returns_app"
router = DefaultRouter()
router.register(r"returns", ReturnViewSet, basename="returns")

urlpatterns = [
    path("lookup/", SaleItemLookupView.as_view(), name="sale-item-lookup"),
    path("", include(router.urls)),
]
