from django.urls import include, path
from rest_framework.routers import DefaultRouter

from suppliers.views import SupplierViewSet

app_name = "suppliers"
router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="suppliers")

urlpatterns = [
    path("", include(router.urls)),
]
