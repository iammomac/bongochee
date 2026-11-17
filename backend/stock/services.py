from django.db.models import F

from stock.models import StockItem, StockMovement


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


def record_movement(stock_item, change, reason, *, user=None, reference="", note="", quantity_after=None):
    if quantity_after is None:
        quantity_after = StockItem.objects.values_list("quantity_remaining", flat=True).get(pk=stock_item.pk)
    return StockMovement.objects.create(
        stock_item=stock_item,
        change=change,
        quantity_after=quantity_after,
        reason=reason,
        reference=reference or "",
        note=note or "",
        user=user if user is not None and user.is_authenticated else None,
    )


def take_one_from_stock(stock_item, reason, *, user=None, reference=""):
    """Take one unit out of a batch that the caller has already locked (lock_stock_items).
    Returns (previous, new) remaining counts; the caller checks availability first."""
    previous = stock_item.quantity_remaining
    stock_item.quantity_remaining -= 1
    stock_item.save(update_fields=["quantity_remaining"])
    record_movement(stock_item, -1, reason, user=user, reference=reference, quantity_after=stock_item.quantity_remaining)
    return previous, stock_item.quantity_remaining


def return_units_to_stock(stock_item_id, reason, *, user=None, reference="", note="", units=1):
    """Put units back into a batch with a single UPDATE ... SET qty = qty + n, so a
    concurrent sale or undo can't overwrite it with a stale value; then log it."""
    StockItem.objects.filter(pk=stock_item_id).update(quantity_remaining=F("quantity_remaining") + units)
    stock_item = StockItem.objects.get(pk=stock_item_id)
    record_movement(stock_item, units, reason, user=user, reference=reference, note=note)
    return stock_item
