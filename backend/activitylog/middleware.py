class ActivityLogMiddleware:
    """
    Captures request metadata (IP, user) onto the request object so views/signals
    can attach it to ActivityLog entries without re-deriving it. Actual log writes
    happen at the point of action (see activitylog.services.log_action), not here,
    so log entries carry meaningful `action` names instead of raw HTTP verbs.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.client_ip = self._get_client_ip(request)
        return self.get_response(request)

    @staticmethod
    def _get_client_ip(request):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        return forwarded.split(",")[0] if forwarded else request.META.get("REMOTE_ADDR")
