from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from activitylog.services import log_action
from rbac.models import Permission, Role
from rbac.permissions import IsAdminOrSuper
from rbac.serializers import PermissionSerializer, RoleSerializer


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrSuper]


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.prefetch_related("permissions").all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, IsAdminOrSuper]

    def perform_create(self, serializer):
        serializer.save()
        log_action(user=self.request.user, action="role.create", request=self.request, role=serializer.instance.name)

    def perform_update(self, serializer):
        serializer.save()
        log_action(user=self.request.user, action="role.update", request=self.request, role=serializer.instance.name)

    def perform_destroy(self, instance):
        if instance.is_system_role:
            raise PermissionDenied("System roles cannot be deleted.")
        name = instance.name
        instance.delete()
        log_action(user=self.request.user, action="role.delete", request=self.request, role=name)
