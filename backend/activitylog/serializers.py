from rest_framework import serializers

from activitylog.models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = ("id", "user", "action", "details", "ip_address", "created_at")
        read_only_fields = ("id", "created_at")
