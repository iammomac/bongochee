from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from notifications.models import Notification

User = get_user_model()


class Command(BaseCommand):
    help = "Reminds every true superuser (is_superuser=True only -- not admin-role users) to take a system backup."

    def handle(self, *args, **options):
        superusers = User.objects.filter(is_superuser=True)
        notifications = [
            Notification(
                recipient=user,
                notification_type="system_alert",
                title="Weekly backup reminder",
                message="It's been a week since the last reminder -- download a fresh system backup from Backup & Restore.",
                link="/backup",
            )
            for user in superusers
        ]
        Notification.objects.bulk_create(notifications)
        self.stdout.write(self.style.SUCCESS(f"Sent backup reminder to {len(notifications)} superuser(s)."))
