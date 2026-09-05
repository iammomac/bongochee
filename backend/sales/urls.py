from django.urls import include, path
from rest_framework.routers import DefaultRouter

from sales.views import SaleViewSet

app_name = "sales"
router = DefaultRouter()
router.register(r"sales", SaleViewSet, basename="sales")

urlpatterns = [
    path("", include(router.urls)),
]
