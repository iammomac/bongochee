from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """25 per page by default; a client loading a whole list can ask for up to 500 at a time
    with ?page_size=, so it needs a handful of requests instead of one per 25 rows."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500
