"""Free-text search over stock lines: type anything that appears in the table.

Every word must match *something* on the line (words are ANDed), and a word can match any
of: brand, model, supplier, invoice number, notes, a quantity (received or in stock), a
price (buying / min / max selling), the import date, or the line's status. So "s23 blue" is
an S23 from a Blue supplier, "500000" is anything priced 500,000, "2026-09" or "sep" is
anything imported that month, and "low" / "out of stock" find what needs restocking."""

import re

from django.db.models import CharField, Q
from django.db.models.functions import Cast

from stock.models import LOW_STOCK_THRESHOLD

MONTHS = {
    name: number
    for number, names in enumerate(
        [
            ("jan", "january"),
            ("feb", "february"),
            ("mar", "march"),
            ("apr", "april"),
            ("may",),
            ("jun", "june"),
            ("jul", "july"),
            ("aug", "august"),
            ("sep", "sept", "september"),
            ("oct", "october"),
            ("nov", "november"),
            ("dec", "december"),
        ],
        start=1,
    )
    for name in names
}

# Multi-word phrases are swapped for one marker word first, so their pieces ("out", "of",
# "stock") aren't each required to match on their own.
PHRASES = (
    (re.compile(r"out of stock|sold out"), "@out"),
    (re.compile(r"low stock"), "@low"),
    (re.compile(r"in stock"), "@in"),
)

# Column names people type while describing a number ("received 10"): they narrow nothing
# by themselves, and the value next to them does the work.
LABEL_WORDS = {
    "received", "remaining", "left", "qty", "quantity", "price", "buying", "selling", "date", "import",
    "imported", "invoice", "stock", "in", "of", "the", "a",
}

NUMBER = re.compile(r"^\d+(\.\d+)?$")
PARTIAL_ISO_DATE = re.compile(r"^\d{4}-\d{2}(-\d{2})?$")
DAY_FIRST_DATE = re.compile(r"^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$")


def _status_q(word):
    if word in ("@out", "empty"):
        return Q(quantity_remaining=0)
    if word in ("@in", "instock"):
        return Q(quantity_remaining__gt=0)
    if word in ("@low", "low"):
        return Q(quantity_remaining__gt=0, quantity_remaining__lte=LOW_STOCK_THRESHOLD)
    if word == "healthy":
        return Q(quantity_remaining__gt=LOW_STOCK_THRESHOLD)
    return None


def _word_q(word):
    q = Q()
    marker = _status_q(word)
    if marker is not None:
        q |= marker
        if word.startswith("@"):
            return q  # a marker isn't text anyone typed, so it only ever means the status

    q |= (
        Q(category__name__icontains=word)
        | Q(model__name__icontains=word)
        | Q(stock_in__supplier__name__icontains=word)
        | Q(stock_in__invoice_number__icontains=word)
        | Q(notes__icontains=word)
    )

    number = word.replace(",", "")
    if NUMBER.match(number):
        if "." not in number:
            q |= Q(quantity=int(number)) | Q(quantity_remaining=int(number))
        # Short numbers would match nearly every price ("5" is inside "500000.00"), so prices
        # are only searched by four digits or more.
        if len(number.replace(".", "")) >= 4:
            q |= Q(buying_price_text__icontains=number) | Q(min_price_text__icontains=number) | Q(max_price_text__icontains=number)
            q |= Q(import_date_text__icontains=number)  # a year, e.g. 2026
    if PARTIAL_ISO_DATE.match(word):
        q |= Q(import_date_text__icontains=word)
    day_first = DAY_FIRST_DATE.match(word)
    if day_first:
        day, month, year = (int(part) for part in day_first.groups())
        if 1 <= month <= 12 and 1 <= day <= 31:
            q |= Q(stock_in__import_date__year=year, stock_in__import_date__month=month, stock_in__import_date__day=day)
    if word in MONTHS:
        q |= Q(stock_in__import_date__month=MONTHS[word])
    return q


def apply_stock_search(queryset, text):
    text = (text or "").lower().strip()
    if not text:
        return queryset
    for pattern, marker in PHRASES:
        text = pattern.sub(f" {marker} ", text)
    words = [word for word in text.split() if word not in LABEL_WORDS]
    if not words:
        return queryset

    queryset = queryset.annotate(
        buying_price_text=Cast("buying_price", CharField()),
        min_price_text=Cast("min_selling_price", CharField()),
        max_price_text=Cast("max_selling_price", CharField()),
        import_date_text=Cast("stock_in__import_date", CharField()),
    )
    for word in words:
        queryset = queryset.filter(_word_q(word))
    return queryset
