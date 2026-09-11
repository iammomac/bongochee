from django.urls import include, path
from rest_framework.routers import DefaultRouter

from loans.views import LoanSaleViewSet

app_name = "loans"
router = DefaultRouter()
router.register(r"loan-sales", LoanSaleViewSet, basename="loan-sales")

urlpatterns = [
    path("", include(router.urls)),
]
