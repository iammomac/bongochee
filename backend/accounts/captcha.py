import json
import urllib.parse
import urllib.request

from django.conf import settings

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile(token, remote_ip):
    """Verifies a Cloudflare Turnstile token server-side. A no-op (always passes)
    until TURNSTILE_SECRET_KEY is configured, so login isn't broken for
    deployments that haven't set up Turnstile yet."""
    if not settings.TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False
    data = urllib.parse.urlencode({
        "secret": settings.TURNSTILE_SECRET_KEY,
        "response": token,
        "remoteip": remote_ip or "",
    }).encode()
    try:
        with urllib.request.urlopen(TURNSTILE_VERIFY_URL, data=data, timeout=5) as resp:
            result = json.loads(resp.read())
    except Exception:
        return False
    return bool(result.get("success"))
