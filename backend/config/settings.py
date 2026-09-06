"""
BONGO CHEE Inventory Management System — Django settings
Phase 1: core configuration (JWT auth, DRF, CORS, PostgreSQL)
"""
from datetime import timedelta
from pathlib import Path

from decouple import config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

INSECURE_SECRET_KEY_DEFAULT = "change-me-in-.env"
SECRET_KEY = config("DJANGO_SECRET_KEY", default=INSECURE_SECRET_KEY_DEFAULT)
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",")

if not DEBUG and SECRET_KEY == INSECURE_SECRET_KEY_DEFAULT:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a real secret when DJANGO_DEBUG=False. "
        "Refusing to start with the insecure placeholder in production."
    )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    # local apps
    "accounts",
    "rbac",
    "catalog",
    "stock",
    "sales",
    "returns_app",
    "suppliers",
    "reports",
    "activitylog",
    "notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "activitylog.middleware.ActivityLogMiddleware",  # logs every mutating request
    "rbac.middleware.PermissionAuditMiddleware",      # enforces + logs permission checks
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

if config("DJANGO_DB_ENGINE", default="postgresql") == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("POSTGRES_DB", default="bongochee"),
            "USER": config("POSTGRES_USER", default="bongochee_user"),
            "PASSWORD": config("POSTGRES_PASSWORD", default="changeme"),
            "HOST": config("POSTGRES_HOST", default="localhost"),
            "PORT": config("POSTGRES_PORT", default="5432"),
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Dar_es_Salaam"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---- REST FRAMEWORK ----
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.CookieJWTAuthentication",  # reads access token from httpOnly cookie
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {"user": "1000/day", "anon": "20/min", "login": "10/min", "password_request": "5/hour"},
    "EXCEPTION_HANDLER": "config.exceptions.custom_exception_handler",
    # Emit real JSON numbers for DecimalField (money) instead of DRF's default
    # string serialization — every frontend type for a currency field assumes `number`.
    "COERCE_DECIMAL_TO_STRING": False,
    "DEFAULT_RENDERER_CLASSES": (
        "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
        "djangorestframework_camel_case.render.CamelCaseBrowsableAPIRenderer",
    ),
    "DEFAULT_PARSER_CLASSES": (
        "djangorestframework_camel_case.parser.CamelCaseJSONParser",
        "djangorestframework_camel_case.parser.CamelCaseFormParser",
        "djangorestframework_camel_case.parser.CamelCaseMultiPartParser",
    ),
}

# ---- SIMPLE JWT ----
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "BONGO CHEE Inventory Management API",
    "DESCRIPTION": "Enterprise-grade inventory, sales, returns, and reporting platform API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---- CORS / CSRF ----
CORS_ALLOWED_ORIGINS = list({
    origin.strip()
    for origin in config("CORS_ALLOWED_ORIGINS", default="http://localhost:5173").split(",")
    if origin.strip()
} | {"http://localhost:5173", "http://127.0.0.1:5173"})
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = list({
    origin.strip()
    for origin in config("CSRF_TRUSTED_ORIGINS", default="http://localhost:5173").split(",")
    if origin.strip()
} | {"http://localhost:5173", "http://127.0.0.1:5173"})

# Cloudflare Turnstile (bot protection on login). Empty by default -> verify_turnstile()
# no-ops, so login keeps working until this is configured. Sign up (free) at
# https://dash.cloudflare.com/?to=/:account/turnstile to get real site/secret keys.
TURNSTILE_SECRET_KEY = config("TURNSTILE_SECRET_KEY", default="")

# "Lax" for local/same-origin dev. Set COOKIE_SAMESITE=None in production when the
# frontend and backend are on different hosts (e.g. two separate Render services) —
# cross-site XHR/fetch never attaches a Lax cookie.
COOKIE_SAMESITE = config("COOKIE_SAMESITE", default="Lax")

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = COOKIE_SAMESITE
CSRF_COOKIE_HTTPONLY = False  # must be readable by JS to send X-CSRFToken header
CSRF_COOKIE_SAMESITE = COOKIE_SAMESITE
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# Auto-logout: how long an access token / idle session is valid (frontend also enforces this)
SESSION_COOKIE_AGE = 60 * 30  # 30 min idle timeout

if not DEBUG:
    # HSTS: tell browsers to only ever hit this host over HTTPS.
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    # Nginx terminates SSL and proxies plain HTTP to gunicorn (see deploy/nginx.conf) —
    # without this, Django can't tell the original request was HTTPS and
    # SECURE_SSL_REDIRECT above loops forever.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
