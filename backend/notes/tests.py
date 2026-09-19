from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from activitylog.models import ActivityLog
from notes.models import Note, NoteShare
from notifications.models import Notification
from rbac.models import Role


def make_user(username, **extra):
    n = User.objects.count() + 1
    return User.objects.create_user(
        username=username, password="Str0ngPassw0rd!", phone=f"2557000001{n:02d}",
        must_change_password=False, **extra,
    )


class NotesTestCase(APITestCase):
    def setUp(self):
        self.owner = make_user("owner", first_name="Olivia", last_name="Owner")
        self.editor = make_user("editor", first_name="Eddie", last_name="Editor")
        self.viewer = make_user("viewer", first_name="Vera", last_name="Viewer")
        self.stranger = make_user("stranger")
        self.client.force_authenticate(self.owner)

    def create_note(self, **fields):
        return Note.objects.create(owner=self.owner, last_edited_by=self.owner, **fields)

    def as_(self, user):
        self.client.force_authenticate(user)

    def url(self, note, suffix=""):
        return f"/api/v1/notes/notes/{note.id}/{suffix}"

    def share(self, note, user, permission):
        return self.client.post(self.url(note, "shares/"), {"user": str(user.id), "permission": permission}, format="json")


class NoteBasicsTests(NotesTestCase):
    def test_anyone_signed_in_can_create_and_read_their_own_note(self):
        self.as_(self.stranger)  # no role, no permissions -- notes need none
        res = self.client.post("/api/v1/notes/notes/", {"title": "Shopping", "body": "milk\neggs"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body["myAccess"], "owner")
        self.assertEqual(body["lastEditedByName"], "stranger")
        self.assertEqual(self.client.get(f"/api/v1/notes/notes/{body['id']}/").json()["body"], "milk\neggs")

    def test_login_is_required(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/notes/notes/").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_an_empty_note_is_allowed_like_a_phones_new_note(self):
        res = self.client.post("/api/v1/notes/notes/", {"title": "", "body": ""}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_body_length_is_capped(self):
        res = self.client.post("/api/v1/notes/notes/", {"title": "x", "body": "a" * 50_001}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_is_a_light_preview_and_is_not_paginated(self):
        for i in range(30):
            self.create_note(title=f"n{i}", body="word " * 100)
        body = self.client.get("/api/v1/notes/notes/").json()
        self.assertEqual(len(body), 30)  # all of them, not the API's usual first 25
        self.assertNotIn("body", body[0])
        self.assertLessEqual(len(body[0]["preview"]), 160)

    def test_pinned_notes_come_first_then_most_recently_edited(self):
        old = self.create_note(title="old")
        self.create_note(title="newer")
        pinned_old = self.create_note(title="pinned but old")
        Note.objects.filter(pk=old.pk).update(updated_at=timezone.now() - timedelta(days=3))
        Note.objects.filter(pk=pinned_old.pk).update(updated_at=timezone.now() - timedelta(days=9), is_pinned=True)
        titles = [n["title"] for n in self.client.get("/api/v1/notes/notes/").json()]
        self.assertEqual(titles, ["pinned but old", "newer", "old"])

    def test_search_matches_title_and_body_but_only_among_notes_you_can_see(self):
        self.create_note(title="Supplier call", body="ask about the A56")
        self.create_note(title="Misc", body="remember the SUPPLIER invoice")
        self.create_note(title="Unrelated", body="nothing here")
        Note.objects.create(owner=self.stranger, title="Supplier secrets", body="not yours")
        found = self.client.get("/api/v1/notes/notes/", {"search": "supplier"}).json()
        self.assertEqual(sorted(n["title"] for n in found), ["Misc", "Supplier call"])

    def test_owner_can_delete_their_note(self):
        note = self.create_note(title="bye")
        self.assertEqual(self.client.delete(self.url(note)).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Note.objects.filter(pk=note.pk).exists())


class NotePrivacyTests(NotesTestCase):
    def test_other_people_cannot_see_or_open_a_private_note(self):
        note = self.create_note(title="private", body="secret")
        self.as_(self.stranger)
        self.assertEqual(self.client.get("/api/v1/notes/notes/").json(), [])
        self.assertEqual(self.client.get(self.url(note)).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.patch(self.url(note), {"title": "hacked"}, format="json").status_code, status.HTTP_404_NOT_FOUND
        )
        self.assertEqual(self.client.delete(self.url(note)).status_code, status.HTTP_404_NOT_FOUND)

    def test_admins_and_the_super_admin_do_not_see_other_peoples_notes(self):
        note = self.create_note(title="private")
        admin = make_user("theadmin", role=Role.objects.create(name="Admin", is_system_role=True))
        boss = make_user("theboss", is_superuser=True)
        for user in (admin, boss):
            self.as_(user)
            self.assertEqual(self.client.get("/api/v1/notes/notes/").json(), [])
            self.assertEqual(self.client.get(self.url(note)).status_code, status.HTTP_404_NOT_FOUND)


class NoteSharingTests(NotesTestCase):
    def test_a_note_shared_for_viewing_can_be_read_but_not_changed(self):
        note = self.create_note(title="Rota", body="Mon: Amina")
        self.share(note, self.viewer, "view")
        self.as_(self.viewer)

        got = self.client.get(self.url(note)).json()
        self.assertEqual(got["body"], "Mon: Amina")
        self.assertEqual(got["myAccess"], "view")
        res = self.client.patch(self.url(note), {"body": "changed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        note.refresh_from_db()
        self.assertEqual(note.body, "Mon: Amina")

    def test_a_note_shared_for_editing_can_be_changed_and_shows_who_did(self):
        note = self.create_note(title="Rota", body="Mon: Amina")
        self.share(note, self.editor, "edit")
        self.as_(self.editor)

        res = self.client.patch(self.url(note), {"body": "Mon: Amina\nTue: Juma"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["lastEditedByName"], "Eddie Editor")
        self.assertEqual(res.json()["myAccess"], "edit")

    def test_someone_with_access_still_cannot_delete_pin_or_share(self):
        note = self.create_note(title="Rota")
        self.share(note, self.editor, "edit")
        self.as_(self.editor)
        self.assertEqual(self.client.delete(self.url(note)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(self.url(note, "pin/"), {"pinned": True}, format="json").status_code, 403)
        self.assertEqual(self.share(note, self.stranger, "edit").status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Note.objects.filter(pk=note.pk).exists())

    def test_shared_notes_appear_in_the_recipients_list_flagged_with_the_owner(self):
        note = self.create_note(title="Rota")
        self.share(note, self.viewer, "view")
        self.as_(self.viewer)
        row = self.client.get("/api/v1/notes/notes/").json()[0]
        self.assertEqual((row["title"], row["myAccess"], row["ownerName"]), ("Rota", "view", "Olivia Owner"))

    def test_sharing_notifies_the_person_once_and_again_only_when_access_changes(self):
        note = self.create_note(title="Rota")
        self.share(note, self.viewer, "view")
        self.share(note, self.viewer, "view")  # nothing changed
        mine = Notification.objects.filter(recipient=self.viewer, notification_type="note_shared")
        self.assertEqual(mine.count(), 1)
        self.assertEqual(mine.first().link, f"/notes?note={note.id}")
        self.assertIn("Olivia Owner", mine.first().title)

        self.share(note, self.viewer, "edit")  # upgraded
        self.assertEqual(mine.count(), 2)
        self.assertEqual(NoteShare.objects.get(note=note, user=self.viewer).permission, "edit")

    def test_cannot_share_with_yourself_an_inactive_user_or_a_non_user(self):
        note = self.create_note()
        self.assertEqual(self.share(note, self.owner, "view").status_code, status.HTTP_400_BAD_REQUEST)
        self.stranger.is_active = False
        self.stranger.save(update_fields=["is_active"])
        self.assertEqual(self.share(note, self.stranger, "view").status_code, status.HTTP_400_BAD_REQUEST)
        bad = self.client.post(self.url(note, "shares/"), {"user": "not-a-uuid", "permission": "view"}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        bad = self.client.post(self.url(note, "shares/"), {"user": str(self.viewer.id), "permission": "admin"}, format="json")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_remove_someone_and_they_lose_access(self):
        note = self.create_note(title="Rota")
        self.share(note, self.viewer, "view")
        res = self.client.delete(self.url(note, f"shares/{self.viewer.id}/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["shares"], [])
        self.as_(self.viewer)
        self.assertEqual(self.client.get(self.url(note)).status_code, status.HTTP_404_NOT_FOUND)

    def test_someone_can_leave_a_note_shared_with_them_but_not_remove_others(self):
        note = self.create_note(title="Rota")
        self.share(note, self.viewer, "view")
        self.share(note, self.editor, "edit")
        self.as_(self.viewer)
        self.assertEqual(self.client.delete(self.url(note, f"shares/{self.editor.id}/")).status_code, 403)
        self.assertEqual(self.client.delete(self.url(note, f"shares/{self.viewer.id}/")).status_code, 204)
        self.assertEqual(self.client.get(self.url(note)).status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(NoteShare.objects.filter(note=note, user=self.editor).exists())  # untouched

    def test_removing_someone_who_had_no_access_is_a_404(self):
        note = self.create_note()
        self.assertEqual(self.client.delete(self.url(note, f"shares/{self.stranger.id}/")).status_code, 404)

    def test_sharing_is_recorded_in_the_activity_log_without_the_notes_content(self):
        note = self.create_note(title="Salary review", body="confidential")
        self.share(note, self.viewer, "view")
        entry = ActivityLog.objects.get(action="note.share")
        self.assertEqual(entry.details, {"shared_with": "viewer", "permission": "view"})
        self.assertNotIn("Salary", str(entry.details))

    def test_deleting_the_note_removes_the_shares(self):
        note = self.create_note()
        self.share(note, self.viewer, "view")
        self.client.delete(self.url(note))
        self.assertFalse(NoteShare.objects.filter(user=self.viewer).exists())

    def test_people_lists_other_active_users_by_name_only(self):
        self.stranger.is_active = False
        self.stranger.save(update_fields=["is_active"])
        people = self.client.get("/api/v1/notes/notes/people/").json()
        self.assertEqual([p["name"] for p in people], ["Eddie Editor", "Vera Viewer"])
        self.assertEqual(set(people[0]), {"id", "name"})  # nothing else about them leaks
        self.as_(self.editor)  # available to ordinary users, who can't list users elsewhere
        self.assertEqual(self.client.get("/api/v1/notes/notes/people/").status_code, status.HTTP_200_OK)


class NoteConflictTests(NotesTestCase):
    def test_a_stale_save_is_refused_with_the_current_version_instead_of_overwriting(self):
        note = self.create_note(title="Rota", body="v1")
        self.share(note, self.editor, "edit")
        opened = self.client.get(self.url(note)).json()["updatedAt"]  # the owner opens it...

        self.as_(self.editor)  # ...then someone else saves...
        self.client.patch(self.url(note), {"body": "v2 from editor"}, format="json")

        self.as_(self.owner)  # ...and the owner's autosave arrives with the old timestamp.
        res = self.client.patch(self.url(note), {"body": "v2 from owner", "expectedUpdatedAt": opened}, format="json")

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.json()["code"], "conflict")
        self.assertIn("Eddie Editor", res.json()["detail"])
        self.assertEqual(res.json()["current"]["body"], "v2 from editor")
        note.refresh_from_db()
        self.assertEqual(note.body, "v2 from editor")  # their work wasn't lost

    def test_a_save_based_on_the_latest_version_goes_through(self):
        note = self.create_note(body="v1")
        latest = self.client.get(self.url(note)).json()["updatedAt"]
        res = self.client.patch(self.url(note), {"body": "v2", "expectedUpdatedAt": latest}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # ...and its response carries the new version for the next autosave to build on.
        res = self.client.patch(
            self.url(note), {"body": "v3", "expectedUpdatedAt": res.json()["updatedAt"]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_overwriting_after_a_conflict_works_by_resending_against_the_current_version(self):
        note = self.create_note(body="v1")
        stale = self.client.get(self.url(note)).json()["updatedAt"]
        self.client.patch(self.url(note), {"body": "v2"}, format="json")
        conflict = self.client.patch(self.url(note), {"body": "mine", "expectedUpdatedAt": stale}, format="json")
        current = conflict.json()["current"]["updatedAt"]
        res = self.client.patch(self.url(note), {"body": "mine", "expectedUpdatedAt": current}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        note.refresh_from_db()
        self.assertEqual(note.body, "mine")


class NotePinTests(NotesTestCase):
    def test_pinning_is_the_owners_own_and_does_not_count_as_an_edit(self):
        note = self.create_note(title="Important")
        before = self.client.get(self.url(note)).json()["updatedAt"]

        res = self.client.post(self.url(note, "pin/"), {"pinned": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()["isPinned"])
        self.assertEqual(res.json()["updatedAt"], before)  # not bumped, so nobody's save goes stale

    def test_the_pin_is_not_shown_to_people_the_note_is_shared_with(self):
        note = self.create_note(title="Important")
        self.client.post(self.url(note, "pin/"), {"pinned": True}, format="json")
        self.share(note, self.viewer, "view")
        self.as_(self.viewer)
        self.assertFalse(self.client.get(self.url(note)).json()["isPinned"])
        self.assertFalse(self.client.get("/api/v1/notes/notes/").json()[0]["isPinned"])

    def test_is_pinned_cannot_be_set_through_a_normal_update(self):
        note = self.create_note()
        self.client.patch(self.url(note), {"isPinned": True}, format="json")
        note.refresh_from_db()
        self.assertFalse(note.is_pinned)


class NoteHousekeepingTests(NotesTestCase):
    def test_deleting_a_user_deletes_their_notes(self):
        self.create_note(title="theirs")
        self.assertEqual(Note.objects.count(), 1)
        self.owner.delete()
        self.assertEqual(Note.objects.count(), 0)

    def test_notes_have_their_own_throttle_not_the_app_wide_daily_limit(self):
        from notes.views import NoteViewSet

        self.assertEqual([t.scope for t in NoteViewSet.throttle_classes], ["notes"])
