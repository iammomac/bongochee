from django.contrib.auth import get_user_model
from rest_framework import serializers

from notes.models import Note, NoteShare

User = get_user_model()

MAX_BODY_LENGTH = 50_000
PREVIEW_LENGTH = 160


def display_name(user):
    return user.get_full_name() or user.username


def access_for(note, user):
    """"owner", "edit", "view", or None -- read from the prefetched shares so listing
    many notes doesn't query once per note."""
    if note.owner_id == user.id:
        return "owner"
    for share in note.shares.all():
        if share.user_id == user.id:
            return share.permission
    return None


class _NoteBase(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    my_access = serializers.SerializerMethodField()
    last_edited_by_name = serializers.SerializerMethodField()

    def _user(self):
        return self.context["request"].user

    def get_owner_name(self, obj):
        return display_name(obj.owner)

    def get_my_access(self, obj):
        return access_for(obj, self._user())

    def get_last_edited_by_name(self, obj):
        return display_name(obj.last_edited_by) if obj.last_edited_by else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Pinning is the owner's own arrangement of their notes; it means nothing to
        # (and isn't shown to) anyone the note is shared with.
        if instance.owner_id != self._user().id:
            data["is_pinned"] = False
        return data


class NoteShareSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = NoteShare
        fields = ("user", "user_name", "permission")

    def get_user_name(self, obj):
        return display_name(obj.user)


class NoteListSerializer(_NoteBase):
    """Light shape for the list pane -- no full body, so polling it stays cheap."""

    preview = serializers.SerializerMethodField()
    shared_count = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = (
            "id", "title", "preview", "is_pinned", "owner", "owner_name", "my_access",
            "shared_count", "last_edited_by_name", "updated_at",
        )

    def get_preview(self, obj):
        return " ".join(obj.body.split())[:PREVIEW_LENGTH]

    def get_shared_count(self, obj):
        return len(obj.shares.all())


class NoteSerializer(_NoteBase):
    shares = NoteShareSerializer(many=True, read_only=True)
    # The updated_at the client last saw. If someone else has saved since, the update is
    # refused (409) rather than silently overwriting their change.
    expected_updated_at = serializers.DateTimeField(write_only=True, required=False)

    class Meta:
        model = Note
        fields = (
            "id", "title", "body", "is_pinned", "owner", "owner_name", "my_access", "shares",
            "last_edited_by_name", "created_at", "updated_at", "expected_updated_at",
        )
        read_only_fields = ("id", "is_pinned", "owner", "created_at", "updated_at")
        extra_kwargs = {"body": {"max_length": MAX_BODY_LENGTH}}


class ShareInputSerializer(serializers.Serializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    permission = serializers.ChoiceField(choices=NoteShare.PERMISSION_CHOICES)


class PinInputSerializer(serializers.Serializer):
    pinned = serializers.BooleanField()
