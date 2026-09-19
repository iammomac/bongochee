import uuid

from django.conf import settings
from django.db import models


class Note(models.Model):
    """A free-form note, like a phone's notes app -- private to its owner until they
    share it with specific people, each either able to edit it or only view it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    # The owner's own pin -- other people a note is shared with don't get a pin of theirs.
    is_pinned = models.BooleanField(default=False)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notes"
        ordering = ["-updated_at"]


class NoteShare(models.Model):
    PERMISSION_CHOICES = [("view", "Can view"), ("edit", "Can edit")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name="shares")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="note_shares")
    permission = models.CharField(max_length=4, choices=PERMISSION_CHOICES, default="view")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "note_shares"
        constraints = [models.UniqueConstraint(fields=["note", "user"], name="unique_note_share")]
