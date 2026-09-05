from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

# NB: these deliberately do NOT subclass ScopedRateThrottle. Its allow_request()
# always re-derives self.scope from view.throttle_scope (never set anywhere in this
# codebase), silently discarding any `scope` class attribute set here — which made
# the previous version of LoginRateThrottle a complete no-op (never throttled, and
# by declaring throttle_classes=[LoginRateThrottle] on the login action it also
# opted that action OUT of the global AnonRateThrottle fallback). Subclassing
# AnonRateThrottle/UserRateThrottle directly reuses their already-correct
# get_cache_key() and genuinely enforces the configured rate.


class LoginRateThrottle(AnonRateThrottle):
    """IP-keyed: applies the `login` rate from DEFAULT_THROTTLE_RATES to the login
    action only. Login is always an unauthenticated request, so IP-based keying
    (inherited from AnonRateThrottle) is the right identity to throttle on."""

    scope = "login"


class PasswordRequestRateThrottle(UserRateThrottle):
    """User-keyed: applies the `password_request` rate to self-service password
    reset requests — the one unauthenticated-adjacent write endpoint with no
    per-action limit otherwise, a realistic vector for spamming admins with
    password-request notifications. The endpoint requires IsAuthenticated, so
    user-id keying (inherited from UserRateThrottle) is appropriate."""

    scope = "password_request"
