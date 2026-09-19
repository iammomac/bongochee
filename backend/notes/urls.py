from django.urls import include, path
from rest_framework.routers import DefaultRouter

from notes.views import NoteViewSet

app_name = "notes"
router = DefaultRouter()
router.register(r"notes", NoteViewSet, basename="notes")

urlpatterns = [
    path("", include(router.urls)),
]
