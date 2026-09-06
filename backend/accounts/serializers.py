from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from accounts.captcha import verify_turnstile
from accounts.models import PasswordChangeRequest, User
from activitylog.services import log_action
from notifications.services import notify_permission_holders
from rbac.models import Role
from rbac.serializers import RoleSummarySerializer

MAX_FAILED_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    captcha_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate(self, attrs):
        request = self.context.get("request")
        if settings.TURNSTILE_SECRET_KEY:
            remote_ip = request.META.get("REMOTE_ADDR") if request else None
            if not verify_turnstile(attrs.get("captcha_token"), remote_ip):
                raise serializers.ValidationError({"detail": "Captcha verification failed. Please try again."})
        existing = User.objects.filter(username=attrs["username"]).first()
        if existing and existing.locked_until and existing.locked_until > timezone.now():
            raise serializers.ValidationError({"detail": "Account temporarily locked. Try again later."})

        user = authenticate(username=attrs["username"], password=attrs["password"])
        if not user:
            if existing:
                existing.failed_login_attempts += 1
                if existing.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
                    existing.locked_until = timezone.now() + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
                existing.save(update_fields=["failed_login_attempts", "locked_until"])
                log_action(user=None, action="login.failed", request=request, username=attrs["username"])
                notify_permission_holders(
                    ["manage_users", "view_logs"],
                    "failed_login",
                    title="Failed login attempt",
                    message=f"Failed login for username '{attrs['username']}'.",
                    link="/logs",
                )
            raise serializers.ValidationError({"detail": "Invalid username or password"})
        if not user.is_active:
            raise serializers.ValidationError({"detail": "Account is inactive"})

        if user.failed_login_attempts or user.locked_until:
            user.failed_login_attempts = 0
            user.locked_until = None
            user.save(update_fields=["failed_login_attempts", "locked_until"])

        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class UserSerializer(serializers.ModelSerializer):
    role = RoleSummarySerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "photo_url",
            "role",
            "is_active",
            "is_active_employee",
            "is_superuser",
            "must_change_password",
            "created_at",
        )
        read_only_fields = ("id", "created_at", "is_superuser")

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    role = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "phone",
            "role",
            "is_active",
            "is_active_employee",
            "password",
        )
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.must_change_password = False
            user.save(update_fields=["password", "must_change_password"])
        return user

    def update(self, instance, validated_data):
        # Base ModelSerializer.update() would otherwise setattr the raw password
        # string onto instance.password, bypassing hashing entirely.
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            # Forced True (not False): whoever is doing this reset only ever hands
            # over a temporary value -- the account holder must immediately choose
            # their own real password nobody else, including the admin who reset
            # it, ever knows. Matters most for the "super admin locked themselves
            # out" recovery case (see UserViewSet.perform_update), but is the right
            # behavior for any admin-driven reset.
            user.must_change_password = True
            user.save(update_fields=["password", "must_change_password"])
        return user

    def validate_password(self, value):
        validate_password(value)
        return value


class PasswordChangeRequestSerializer(serializers.ModelSerializer):
    """Read-oriented: requests are always created for `request.user` (see
    PasswordChangeRequestViewSet.create) and never written through this serializer."""

    user = UserSerializer(read_only=True)
    reviewed_by = serializers.SlugRelatedField(slug_field="username", read_only=True)

    class Meta:
        model = PasswordChangeRequest
        fields = ("id", "user", "reason", "status", "requested_at", "reviewed_by", "reviewed_at", "temp_password_issued")
        read_only_fields = fields
