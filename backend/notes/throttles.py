from rest_framework.throttling import UserRateThrottle


class NotesRateThrottle(UserRateThrottle):
    """A notes editor autosaves as you type and refreshes to show other people's
    changes, so it makes far more requests than the rest of the app. It gets its own
    (much larger) bucket -- and, because a view-level throttle replaces the defaults,
    those requests also don't eat into the app-wide per-user daily limit that would
    otherwise lock someone out of everything else after a day of writing notes."""

    scope = "notes"
