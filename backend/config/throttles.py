from rest_framework.throttling import UserRateThrottle


class LiveRefreshRateThrottle(UserRateThrottle):
    """For the screens that refresh themselves on a timer (dashboard, loan charts, the
    notification bell). An open tab makes thousands of these requests a day, which would
    use up the app-wide per-user daily limit and lock the person out of everything else.
    They get their own, much larger bucket instead -- and, because a view-level throttle
    replaces the defaults, they also stop counting against the ordinary one."""

    scope = "live"
