from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import AuthViewSet, PasswordChangeRequestViewSet, UserViewSet

app_name = "accounts"
router = DefaultRouter()
router.register(r"", AuthViewSet, basename="auth")
router.register(r"users", UserViewSet, basename="users")
router.register(r"password-requests", PasswordChangeRequestViewSet, basename="password-requests")

urlpatterns = [
    path("", include(router.urls)),
]
