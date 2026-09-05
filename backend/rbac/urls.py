from django.urls import include, path
from rest_framework.routers import DefaultRouter

from rbac.views import PermissionViewSet, RoleViewSet

app_name = "rbac"
router = DefaultRouter()
router.register(r"permissions", PermissionViewSet, basename="permissions")
router.register(r"roles", RoleViewSet, basename="roles")

urlpatterns = [
    path("", include(router.urls)),
]
