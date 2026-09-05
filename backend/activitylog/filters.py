import django_filters

from activitylog.models import ActivityLog


class ActivityLogFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = ActivityLog
        fields = ["user", "action", "date_from", "date_to"]
