import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from rbac.models import Permission, Role

User = get_user_model()

permission_codes = [
    ("view_dashboard", "View Dashboard", "general"),
    ("add_stock", "Add Stock", "stock"),
    ("edit_stock", "Edit Stock", "stock"),
    ("delete_stock", "Delete Stock", "stock"),
    ("create_sales", "Create Sales", "sales"),
    ("edit_sales", "Edit Sales", "sales"),
    ("delete_sales", "Delete Sales", "sales"),
    ("create_returns", "Create Returns", "returns"),
    ("edit_returns", "Edit Returns", "returns"),
    ("view_reports", "View Reports", "reports"),
    ("export_reports", "Export Reports", "reports"),
    ("manage_users", "Manage Users", "admin"),
    ("manage_roles", "Manage Roles", "admin"),
    ("manage_suppliers", "Manage Suppliers", "admin"),
    ("view_profit", "View Profit", "reports"),
    ("view_logs", "View Logs", "admin"),
]

for codename, label, category in permission_codes:
    Permission.objects.get_or_create(codename=codename, defaults={"label": label, "category": category})

admin_role, _ = Role.objects.get_or_create(name="Admin", defaults={"description": "System administrator", "is_system_role": True})
admin_role.permissions.set(Permission.objects.all())

manager_role, _ = Role.objects.get_or_create(name="Manager", defaults={"description": "Operations manager"})
manager_role.permissions.add(*Permission.objects.exclude(codename__in=["manage_roles", "manage_users", "view_logs"]))

# Two-tier admin: "super" is the one true Django superuser — it must always be able
# to log in with this exact credential, so the password is force-set every run
# rather than left alone on an existing row.
super_user, _ = User.objects.get_or_create(
    username="super", defaults={"email": "super@bongochee.com", "phone": "255700000001"}
)
super_user.set_password("@Momac2703")
super_user.is_superuser = True
super_user.is_staff = True
super_user.is_active = True
super_user.must_change_password = False
super_user.save()

# "admin" is the system-role tier: full bypass via role.is_system_role, but NOT a
# Django superuser, so it can't touch the "super" account (see UserViewSet.perform_update).
# Its password may already be customized — only role/is_superuser are touched here.
if User.objects.filter(username="admin").exists():
    existing_admin = User.objects.get(username="admin")
    if existing_admin.is_superuser:
        existing_admin.is_superuser = False
        existing_admin.role = admin_role
        existing_admin.save(update_fields=["is_superuser", "role"])
else:
    User.objects.create_user(
        username="admin",
        email="admin@bongochee.com",
        password="Bongochee@2026",
        phone="255700000000",
        role=admin_role,
    )
