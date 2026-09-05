from django.contrib.auth import get_user_model
from django.db.models import Q

from notifications.models import Notification

User = get_user_model()


def _permission_holders(codenames):
    """Same resolution HasPermission uses: superuser, system-role, or holds any of
    the given permission codenames — kept as one shared function so every event
    source targets recipients identically instead of reimplementing this per call site."""
    if isinstance(codenames, str):
        codenames = [codenames]
    return User.objects.filter(
        Q(is_superuser=True) | Q(role__is_system_role=True) | Q(role__permissions__codename__in=codenames)
    ).distinct()


def notify_permission_holders(codenames, notification_type, title, message="", link="", exclude_user=None):
    recipients = _permission_holders(codenames)
    if exclude_user is not None:
        recipients = recipients.exclude(id=exclude_user.id)
    Notification.objects.bulk_create(
        [
            Notification(
                recipient=user,
                notification_type=notification_type,
                title=title,
                message=message,
                link=link,
            )
            for user in recipients
        ]
    )
