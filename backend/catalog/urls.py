from django.urls import include, path
from rest_framework.routers import DefaultRouter

from catalog.views import CategoryViewSet, PhoneModelViewSet

app_name = "catalog"
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="categories")
router.register(r"models", PhoneModelViewSet, basename="models")

urlpatterns = [
    path("", include(router.urls)),
]
