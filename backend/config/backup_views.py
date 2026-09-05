import gzip
import json
import os
import tempfile
from datetime import datetime
from io import StringIO

from django.core.management import call_command
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activitylog.services import log_action
from rbac.permissions import IsAdminOrSuper, IsSuperUser

MAX_RESTORE_SIZE_MB = 50

# Framework-managed / environment-specific tables — never part of a portable
# data backup (contenttypes/permission ids and session/blacklist state don't
# mean the same thing across two independent databases).
DUMP_EXCLUDES = ["contenttypes", "auth.permission", "sessions", "admin.logentry", "token_blacklist"]


class SystemBackupView(APIView):
    """Downloads a full data export (Django dumpdata) as gzipped JSON. Contains
    every user's data, including password hashes — admin/super only."""

    permission_classes = [IsAuthenticated, IsAdminOrSuper]

    def get(self, request):
        buffer = StringIO()
        try:
            call_command("dumpdata", exclude=DUMP_EXCLUDES, indent=2, stdout=buffer)
        except Exception:
            return Response({"detail": "Backup failed."}, status=500)

        log_action(user=request.user, action="system.backup_download", request=request)
        filename = f"bongochee-backup-{datetime.now():%Y-%m-%d}.json.gz"
        response = HttpResponse(
            gzip.compress(buffer.getvalue().encode("utf-8")), content_type="application/gzip"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class SystemRestoreView(APIView):
    """Restores data from an uploaded backup (a .json.gz produced by the endpoint
    above). This is a MERGE, not a wipe: any record whose id matches one in the
    backup is overwritten with the backup's version; anything not mentioned in
    the backup is left alone; a record only in the backup (e.g. something since
    deleted) is added back. Wrapped in one transaction by Django's own loaddata,
    so a bad file changes nothing rather than leaving things half-restored.

    True superuser only, and requires re-entering the current password — it can
    still silently overwrite records that changed since the backup was taken."""

    permission_classes = [IsAuthenticated, IsSuperUser]
    parser_classes = [MultiPartParser]

    def post(self, request):
        password = request.data.get("password", "")
        if not password or not request.user.check_password(password):
            return Response({"detail": "Incorrect password."}, status=400)

        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "No file uploaded."}, status=400)
        if upload.size > MAX_RESTORE_SIZE_MB * 1024 * 1024:
            return Response({"detail": f"File must be under {MAX_RESTORE_SIZE_MB}MB."}, status=400)

        try:
            json_bytes = gzip.decompress(upload.read())
            json.loads(json_bytes)  # fail fast on garbage before touching the database
        except (OSError, ValueError):
            return Response({"detail": "File isn't a valid backup (.json.gz)."}, status=400)

        # delete=False + explicit close before loaddata reopens it by path: on Windows
        # (unlike POSIX) a second open of a still-open NamedTemporaryFile fails outright.
        tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        try:
            tmp.write(json_bytes)
            tmp.close()
            call_command("loaddata", tmp.name)
        except Exception:
            log_action(user=request.user, action="system.restore_failed", request=request)
            return Response({"detail": "Restore failed — no changes were made."}, status=500)
        finally:
            os.unlink(tmp.name)

        log_action(user=request.user, action="system.restore", request=request)
        return Response({"detail": "Restore complete. Other users may need to log in again."})
