from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from activitylog.filters import ActivityLogFilter
from activitylog.models import ActivityLog
from activitylog.serializers import ActivityLogSerializer
from rbac.permissions import HasPermission


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ActivityLog.objects.select_related("user").all()
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    # manage_users covers an admin viewing an employee's activity timeline from the
    # Person Report — view_logs remains the general "browse the audit log" grant.
    required_permission = ("view_logs", "manage_users")
    filterset_class = ActivityLogFilter
