from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/rbac/", include("rbac.urls")),
    path("api/v1/catalog/", include("catalog.urls")),
    path("api/v1/suppliers/", include("suppliers.urls")),
    path("api/v1/stock/", include("stock.urls")),
    path("api/v1/sales/", include("sales.urls")),
    path("api/v1/returns/", include("returns_app.urls")),
    path("api/v1/reports/", include("reports.urls")),
    path("api/v1/logs/", include("activitylog.urls")),
    path("api/v1/notifications/", include("notifications.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
