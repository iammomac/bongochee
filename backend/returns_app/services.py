from rest_framework import serializers

from returns_app.models import ReturnCategory


def get_or_create_return_category(name):
    """Case-insensitive get-or-create, so "Water damage" and "water damage" are one category."""
    name = " ".join((name or "").split())
    if not name:
        return None, False
    existing = ReturnCategory.objects.filter(name__iexact=name).first()
    if existing:
        return existing, False
    return ReturnCategory.objects.create(name=name), True


def set_return_outcome(return_record, new_outcome, user):
    """Record what happened to a returned phone, keeping stock in step. Must run inside a
    transaction. Only "restocked" changes stock: the unit goes back into its batch and the
    original sale line stops holding the IMEI, so the phone can be sold again. Moving off
    "restocked" (e.g. it turned out to need repair) takes the unit back out -- unless it has
    already been sold again."""
    from sales.models import SaleItem
    from sales.serializers import imei_in_use
    from stock.services import lock_stock_items, return_units_to_stock, take_one_from_stock

    old_outcome = return_record.outcome
    if new_outcome == old_outcome:
        return
    sale_item = SaleItem.objects.select_for_update().select_related("sale").get(pk=return_record.sale_item_id)
    reference = sale_item.sale.invoice_number

    if old_outcome == "restocked":
        stock_item = lock_stock_items([sale_item.stock_item_id])[sale_item.stock_item_id]
        if stock_item.quantity_remaining < 1 or (sale_item.imei and imei_in_use(sale_item.imei, exclude_sale_item=sale_item)):
            raise serializers.ValidationError(
                {"detail": "This phone has already been sold again, so it can't be taken off sale."}
            )
        take_one_from_stock(stock_item, "return_unrestocked", user=user, reference=reference)
        sale_item.is_active = True
        sale_item.save(update_fields=["is_active"])

    if new_outcome == "restocked":
        if sale_item.sale.is_voided or not sale_item.is_active:
            raise serializers.ValidationError({"detail": "This phone is already back in stock."})
        sale_item.is_active = False
        sale_item.save(update_fields=["is_active"])
        return_units_to_stock(
            sale_item.stock_item_id,
            "return_restocked",
            user=user,
            reference=reference,
            note=return_record.return_category.name,
        )

    return_record.outcome = new_outcome
    return_record.save(update_fields=["outcome"])
