import random
import string

from django.conf import settings
from django.contrib.auth import login as django_login, logout as django_logout
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import PasswordChangeRequest, User
from accounts.serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordChangeRequestSerializer,
    UserCreateSerializer,
    UserSerializer,
)
from accounts.throttles import LoginRateThrottle, PasswordRequestRateThrottle
from activitylog.services import log_action
from notifications.services import notify_permission_holders
from rbac.permissions import HasPermission, IsAdminOrSuper

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth/"


def _set_auth_cookies(response, user):
    refresh = RefreshToken.for_user(user)
    response.set_cookie(
        ACCESS_COOKIE,
        str(refresh.access_token),
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path=REFRESH_COOKIE_PATH,
    )


def _clear_auth_cookies(response):
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


class AuthViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    def get_permissions(self):
        if self.action == "change_password":
            return [IsAuthenticated()]
        return [AllowAny()]

    @action(detail=False, methods=["post"], url_path="login", throttle_classes=[LoginRateThrottle])
    def login(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        django_login(request, user)
        response = Response(UserSerializer(user, context={"request": request}).data, status=status.HTTP_200_OK)
        _set_auth_cookies(response, user)
        log_action(user=user, action="login", request=request, username=user.username)
        return response

    @action(detail=False, methods=["post"], url_path="logout")
    def logout(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        django_logout(request)
        response = Response({"detail": "Signed out"}, status=status.HTTP_200_OK)
        _clear_auth_cookies(response)
        log_action(user=request.user if request.user.is_authenticated else None, action="logout", request=request)
        return response

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Unauthenticated"}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(UserSerializer(request.user, context={"request": request}).data)

    @action(detail=False, methods=["post"], url_path="refresh")
    def refresh(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return Response({"detail": "No refresh token"}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            old_refresh = RefreshToken(raw_refresh)
            user = User.objects.get(id=old_refresh["user_id"])
        except (TokenError, User.DoesNotExist):
            response = Response({"detail": "Invalid refresh token"}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_auth_cookies(response)
            return response
        try:
            old_refresh.blacklist()
        except TokenError:
            pass
        response = Response({"detail": "Refreshed"})
        _set_auth_cookies(response, user)
        return response

    @action(detail=False, methods=["get"], url_path="csrf")
    def csrf(self, request):
        return Response({"csrfToken": get_token(request)})

    @action(detail=False, methods=["post"], url_path="change-password")
    def change_password(self, request):
        if not request.user.must_change_password:
            return Response({"detail": "Password already set"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.last_password_change = timezone.now()
        user.failed_login_attempts = 0
        user.save(update_fields=["password", "must_change_password", "last_password_change", "failed_login_attempts"])
        log_action(user=user, action="password.change_forced", request=request, username=user.username)
        return Response(UserSerializer(user, context={"request": request}).data)


class UserViewSet(viewsets.ModelViewSet):
    # No "delete" — Sale.sold_by is on_delete=PROTECT, so hard-deleting a user with
    # sales history 500s. Lifecycle is managed via is_active/is_active_employee instead.
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    queryset = User.objects.select_related("role").all()
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            # Reports needs to populate a "filter by employee" dropdown without being
            # admin/super — view_reports alone is enough for this read-only case.
            self.required_permission = "view_reports"
            return [IsAuthenticated(), HasPermission()]
        # Users & Roles are admin/super-only end to end — no custom role, however
        # permissioned, gets write access here.
        return [IsAuthenticated(), IsAdminOrSuper()]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        serializer.save()
        log_action(user=self.request.user, action="user.create", request=self.request, username=serializer.instance.username)

    def perform_update(self, serializer):
        if serializer.instance.is_superuser and not self.request.user.is_superuser:
            raise PermissionDenied("Only a super admin can modify this account.")
        serializer.save()
        log_action(user=self.request.user, action="user.update", request=self.request, username=serializer.instance.username)


class PasswordChangeRequestViewSet(viewsets.ModelViewSet):
    queryset = PasswordChangeRequest.objects.select_related("user", "reviewed_by").all()
    serializer_class = PasswordChangeRequestSerializer
    required_permission = "manage_users"
    filterset_fields = ["status"]

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated()]
        return [IsAuthenticated(), HasPermission()]

    def get_throttles(self):
        if self.action == "create":
            return [PasswordRequestRateThrottle()]
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        # A user may only ever request a reset for themselves — the "user" field, if any
        # is supplied in the request body, is deliberately ignored to prevent one account
        # from creating reset requests on another's behalf.
        req = PasswordChangeRequest.objects.create(user=request.user, reason=request.data.get("reason", ""))
        log_action(user=request.user, action="password.request", request=request, target=request.user.username)
        notify_permission_holders(
            "manage_users",
            "password_request",
            title="Password reset requested",
            message=f"{request.user.get_full_name() or request.user.username} requested a password reset.",
            link="/users",
            exclude_user=request.user,
        )
        return Response(PasswordChangeRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        req = self.get_object()
        if req.status != "pending":
            return Response({"detail": "Request already processed"}, status=status.HTTP_400_BAD_REQUEST)
        temp_password = "".join(random.choices(string.ascii_letters + string.digits, k=12))
        req.user.set_password(temp_password)
        req.user.must_change_password = True
        req.user.save(update_fields=["password", "must_change_password"])
        req.status = "approved"
        req.temp_password_issued = True
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save(update_fields=["status", "temp_password_issued", "reviewed_by", "reviewed_at"])
        log_action(user=request.user, action="password.approve", request=request, target=req.user.username)
        return Response({"detail": "Password reset approved", "temporaryPassword": temp_password})
