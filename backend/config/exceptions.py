from rest_framework.views import exception_handler


def _flatten_detail(data):
    """Reduce any DRF error payload shape (plain string, error list, or per-field
    validation dict like {"newPassword": ["Too common."]}) down to one readable string."""
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        return _flatten_detail(data[0]) if data else "An error occurred."
    if isinstance(data, dict):
        if "detail" in data:
            return _flatten_detail(data["detail"])
        first_value = next(iter(data.values()), None)
        return _flatten_detail(first_value) if first_value is not None else "An error occurred."
    return str(data)


def custom_exception_handler(exc, context):
    """Wraps DRF's default handler so every error returns a consistent {detail, code} shape,
    with `detail` always a plain string regardless of the underlying error's shape."""
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            "detail": _flatten_detail(response.data),
            "code": getattr(exc, "default_code", "error"),
        }
    return response
