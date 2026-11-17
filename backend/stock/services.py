from django.db.models import F

from stock.models import StockItem


def lock_stock_items(ids):
    """Lock the given stock batches for the rest of the current transaction and return them by id.

    Two cashiers selling the last unit at the same moment would otherwise both read
    "1 left", both pass the check and both sell it. With the rows locked, the second
    sale waits until the first has committed and then sees the true count.

    Locks are taken in a fixed (id) order so two sales that share batches can't each
    hold one lock while waiting on the other (a deadlock). Must be called inside
    transaction.atomic.
    """
    unique_ids = sorted(set(ids), key=str)
    return {item.id: item for item in StockItem.objects.select_for_update().filter(id__in=unique_ids).order_by("id")}


def return_units_to_stock(stock_item_id, units=1):
    """Put units back into a batch with a single UPDATE ... SET qty = qty + n, so a
    concurrent sale or undo can't overwrite it with a stale value."""
    StockItem.objects.filter(pk=stock_item_id).update(quantity_remaining=F("quantity_remaining") + units)
