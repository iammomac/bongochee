from django.urls import include, path
from rest_framework.routers import DefaultRouter

from activitylog.views import ActivityLogViewSet

app_name = "activitylog"
router = DefaultRouter()
router.register(r"logs", ActivityLogViewSet, basename="logs")

urlpatterns = [
    path("", include(router.urls)),
]
