from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from activitylog.services import log_action
from notes.models import Note, NoteShare
from notes.serializers import (
    NoteListSerializer,
    NoteSerializer,
    PinInputSerializer,
    ShareInputSerializer,
    access_for,
    display_name,
)
from notes.throttles import NotesRateThrottle
from notifications.models import Notification

User = get_user_model()

# Note titles are private, so activity-log entries record who shared with whom -- never
# what the note said.


class NoteViewSet(viewsets.ModelViewSet):
    """Every signed-in user has their own notes -- there's no role permission for this.
    A note is visible only to its owner and the people it's shared with; that includes
    admins and the super admin, who see no one else's notes through the app."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [NotesRateThrottle]
    # A notes app shows all of your notes, not a page of them.
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        shared_with_me = NoteShare.objects.filter(user=user).values("note_id")
        qs = (
            Note.objects.filter(Q(owner=user) | Q(pk__in=shared_with_me))
            .select_related("owner", "last_edited_by")
            .prefetch_related(Prefetch("shares", queryset=NoteShare.objects.select_related("user")))
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(body__icontains=search))
        return qs

    def get_serializer_class(self):
        return NoteListSerializer if self.action == "list" else NoteSerializer

    def list(self, request, *args, **kwargs):
        user = request.user
        notes = sorted(
            self.filter_queryset(self.get_queryset()),
            # Your pinned notes first, then most recently edited.
            key=lambda n: (not (n.owner_id == user.id and n.is_pinned), -n.updated_at.timestamp()),
        )
        return Response(self.get_serializer(notes, many=True).data)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, last_edited_by=self.request.user)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        visible = self.get_object()  # 404 for anyone without access
        access = access_for(visible, request.user)
        if access not in ("owner", "edit"):
            raise PermissionDenied("You only have view access to this note.")

        # Lock the row so two people saving at once can't both pass the staleness check.
        note = Note.objects.select_for_update().get(pk=visible.pk)
        serializer = self.get_serializer(note, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        expected = serializer.validated_data.pop("expected_updated_at", None)
        if expected is not None and expected != note.updated_at:
            current = self.get_queryset().get(pk=note.pk)
            return Response(
                {
                    "detail": f"{display_name(note.last_edited_by) if note.last_edited_by else 'Someone'} "
                    "changed this note while you were editing it.",
                    "code": "conflict",
                    "current": NoteSerializer(current, context=self.get_serializer_context()).data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer.save(last_edited_by=request.user)
        return Response(NoteSerializer(self.get_queryset().get(pk=note.pk), context=self.get_serializer_context()).data)

    def perform_destroy(self, instance):
        if instance.owner_id != self.request.user.id:
            raise PermissionDenied("Only the owner can delete this note. You can remove it from your list instead.")
        instance.delete()

    def _fresh(self, note):
        return NoteSerializer(self.get_queryset().get(pk=note.pk), context=self.get_serializer_context()).data

    @action(detail=True, methods=["post"], url_path="pin")
    def pin(self, request, pk=None):
        note = self.get_object()
        if note.owner_id != request.user.id:
            raise PermissionDenied("Only the owner can pin this note.")
        body = PinInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        note.is_pinned = body.validated_data["pinned"]
        # update_fields: pinning is bookkeeping, not an edit -- it shouldn't bump
        # updated_at (which would reorder the list and trip other editors' staleness check).
        note.save(update_fields=["is_pinned"])
        return Response(self._fresh(note))

    @action(detail=True, methods=["post"], url_path="shares")
    def share(self, request, pk=None):
        """Give someone access, or change what they can do (idempotent on the person)."""
        note = self.get_object()
        if note.owner_id != request.user.id:
            raise PermissionDenied("Only the owner can share this note.")
        body = ShareInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        target = body.validated_data["user"]
        permission = body.validated_data["permission"]
        if target.id == note.owner_id:
            raise ValidationError({"detail": "You already own this note."})

        share, created = NoteShare.objects.get_or_create(note=note, user=target, defaults={"permission": permission})
        changed = created or share.permission != permission
        if not created and changed:
            share.permission = permission
            share.save(update_fields=["permission"])

        if changed:
            can = "edit" if permission == "edit" else "view"
            label = (note.title or "Untitled note")[:80]
            Notification.objects.create(
                recipient=target,
                notification_type="note_shared",
                title=f"{display_name(request.user)} shared a note with you",
                message=f"\"{label}\" -- you can {can} it.",
                link=f"/notes?note={note.id}",
            )
            log_action(
                user=request.user, action="note.share", request=request,
                shared_with=target.username, permission=permission,
            )
        return Response(self._fresh(note))

    @action(detail=True, methods=["delete"], url_path=r"shares/(?P<user_id>[0-9a-fA-F-]{36})")
    def unshare(self, request, pk=None, user_id=None):
        """Owner removes someone -- or a person removes themselves from a note shared
        with them (that's how you 'leave' one)."""
        note = self.get_object()
        is_owner = note.owner_id == request.user.id
        if not is_owner and str(request.user.id) != str(user_id).lower():
            raise PermissionDenied("Only the owner can remove other people from this note.")

        share = note.shares.filter(user_id=user_id).first()
        if share is None:
            return Response({"detail": "That person doesn't have access to this note."}, status=status.HTTP_404_NOT_FOUND)
        removed = share.user
        share.delete()
        log_action(
            user=request.user, action="note.unshare", request=request,
            removed=removed.username, left=not is_owner,
        )
        if not is_owner:
            return Response(status=status.HTTP_204_NO_CONTENT)  # they can't see the note any more
        return Response(self._fresh(note))

    @action(detail=False, methods=["get"], url_path="people")
    def people(self, request):
        """Who a note can be shared with: every other active user, by name only."""
        users = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
        rows = sorted(({"id": u.id, "name": display_name(u)} for u in users), key=lambda r: r["name"].lower())
        return Response(rows)
