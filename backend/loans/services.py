"""Numbers behind the loan-sales charts (loan sales page and dashboard)."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from loans.models import LoanPayment, LoanSale, LoanSaleItem

NET_PRICE = F("selling_price") - F("discount")

MAX_SUMMARY_DAYS = 365


def loan_trend(days):
    """One point per day for the last `days` days (zero-filled, so quiet days still
    appear on the axis): how many loans were made, and their revenue and expected
    profit (revenue less what the phones cost)."""
    today = timezone.localdate()
    window_start = today - timedelta(days=days - 1)
    daily = (
        LoanSaleItem.objects.filter(
            loan_sale__created_at__date__gte=window_start, loan_sale__created_at__date__lte=today
        )
        .annotate(day=TruncDate("loan_sale__created_at"))
        .values("day")
        .annotate(
            loans=Count("loan_sale", distinct=True),
            units=Count("id"),
            revenue=Sum(NET_PRICE),
            cost=Sum("stock_item__buying_price"),
        )
    )
    by_day = {row["day"]: row for row in daily}

    trend = []
    for offset in range(days):
        day = window_start + timedelta(days=offset)
        row = by_day.get(day)
        revenue = (row["revenue"] or 0) if row else 0
        cost = (row["cost"] or 0) if row else 0
        trend.append(
            {
                "date": day,
                "loans": row["loans"] if row else 0,
                "units": row["units"] if row else 0,
                "revenue": revenue,
                "expected_profit": revenue - cost,
            }
        )
    return trend


def loan_receivables():
    """The whole loan book, not just the chart window -- what's been collected versus
    what's still owed is a live position, so it doesn't depend on when each loan was
    made. Balances are floored at zero per loan so one overpaid loan can't cancel out
    another's debt."""
    totals = {
        row["loan_sale_id"]: row["total"] or Decimal("0")
        for row in LoanSaleItem.objects.values("loan_sale_id").annotate(total=Sum(NET_PRICE))
    }
    paid = {
        row["loan_sale_id"]: row["paid"] or Decimal("0")
        for row in LoanPayment.objects.values("loan_sale_id").annotate(paid=Sum("amount"))
    }

    result = {
        "total": Decimal("0"),
        "paid": Decimal("0"),
        "owed": Decimal("0"),
        "loans_open": 0,
        "loans_partial": 0,
        "loans_paid": 0,
    }
    for loan_id in LoanSale.objects.values_list("id", flat=True):
        total = totals.get(loan_id, Decimal("0"))
        loan_paid = paid.get(loan_id, Decimal("0"))
        result["total"] += total
        result["paid"] += loan_paid
        result["owed"] += max(total - loan_paid, Decimal("0"))
        if total > 0 and loan_paid >= total:
            result["loans_paid"] += 1
        elif loan_paid > 0:
            result["loans_partial"] += 1
        else:
            result["loans_open"] += 1
    return result


def loan_summary(days):
    trend = loan_trend(days)
    return {
        "days": days,
        "trend": trend,
        "totals": {
            "loans": sum(point["loans"] for point in trend),
            "units": sum(point["units"] for point in trend),
            "revenue": sum((point["revenue"] for point in trend), Decimal("0")),
            "expected_profit": sum((point["expected_profit"] for point in trend), Decimal("0")),
        },
        "receivables": loan_receivables(),
    }
