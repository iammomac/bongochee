"""Shared aggregation engine for every report type. Each report the spec names is a
thin configuration of one of the functions below (a group_by + date range + filters),
not a separately-implemented query — see reports/views.py for how they're wired up."""

from django.contrib.auth import get_user_model
from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from activitylog.models import ActivityLog
from catalog.models import Category, PhoneModel
from rbac.models import Role
from returns_app.models import Return
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier

RETURN_CATEGORY_LABELS = dict(Return.RETURN_CATEGORY_CHOICES)

NET_PRICE = F("selling_price") - F("discount")
PROFIT = NET_PRICE - F("stock_item__buying_price")

PAYMENT_METHOD_LABELS = {"cash": "Cash", "mobile_money": "Mobile Money", "card": "Card"}

SALES_GROUP_BY_FIELDS = {
    "category": ("stock_item__category_id", "stock_item__category__name"),
    "model": ("stock_item__model_id", "stock_item__model__name"),
    "user": ("sale__sold_by_id", "sale__sold_by__username"),
    "payment_method": ("sale__payment_method", "sale__payment_method"),
    "supplier": ("stock_item__stock_in__supplier_id", "stock_item__stock_in__supplier__name"),
}


def filtered_sale_items(date_from, date_to, category=None, model=None, supplier=None, user=None, payment_method=None):
    qs = SaleItem.objects.filter(
        sale__created_at__date__gte=date_from, sale__created_at__date__lte=date_to
    ).select_related(
        "sale__sold_by", "stock_item__category", "stock_item__model", "stock_item__stock_in__supplier"
    )
    if category:
        qs = qs.filter(stock_item__category_id=category)
    if model:
        qs = qs.filter(stock_item__model_id=model)
    if supplier:
        qs = qs.filter(stock_item__stock_in__supplier_id=supplier)
    if user:
        qs = qs.filter(sale__sold_by_id=user)
    if payment_method:
        qs = qs.filter(sale__payment_method=payment_method)
    return qs


def _aggregate_sales(qs):
    totals = qs.aggregate(units=Count("id"), revenue=Sum(NET_PRICE), profit=Sum(PROFIT))
    return {
        "units": totals["units"] or 0,
        "revenue": totals["revenue"] or 0,
        "profit": totals["profit"] or 0,
    }


def _format_label(group_by, raw_label, raw_key):
    if group_by == "payment_method":
        return PAYMENT_METHOD_LABELS.get(raw_key, raw_key)
    if group_by == "day":
        return raw_key.strftime("%d %b %Y")
    return str(raw_label if raw_label is not None else raw_key)


def sales_rows(date_from, date_to, group_by="day", **filters):
    """The workhorse: Daily/Weekly/Monthly/Profit/Brand/Model/User reports are all
    this function with a different group_by and date range preset."""
    qs = filtered_sale_items(date_from, date_to, **filters)

    if group_by == "day":
        grouped = (
            qs.annotate(key=TruncDate("sale__created_at"))
            .values("key")
            .annotate(units=Count("id"), revenue=Sum(NET_PRICE), profit=Sum(PROFIT))
            .order_by("key")
        )
        return [
            {
                "key": row["key"].isoformat(),
                "label": _format_label(group_by, None, row["key"]),
                "units": row["units"],
                "revenue": row["revenue"] or 0,
                "profit": row["profit"] or 0,
            }
            for row in grouped
        ]

    id_field, label_field = SALES_GROUP_BY_FIELDS[group_by]
    grouped = (
        qs.values(id_field, label_field)
        .annotate(units=Count("id"), revenue=Sum(NET_PRICE), profit=Sum(PROFIT))
        .order_by("-revenue")
    )
    rows = []
    for row in grouped:
        raw_key = row[id_field]
        raw_label = row.get(label_field)
        rows.append(
            {
                "key": str(raw_key),
                "label": _format_label(group_by, raw_label, raw_key),
                "units": row["units"],
                "revenue": row["revenue"] or 0,
                "profit": row["profit"] or 0,
            }
        )
    return rows


def sales_totals(date_from, date_to, **filters):
    return _aggregate_sales(filtered_sale_items(date_from, date_to, **filters))


RETURNS_GROUP_BY_FIELDS = {
    "category": ("return_category", None),
    "model": ("sale_item__stock_item__model_id", "sale_item__stock_item__model__name"),
}


def returns_rows(date_from, date_to, group_by="category", category=None, model=None, user=None):
    qs = Return.objects.filter(return_date__gte=date_from, return_date__lte=date_to).select_related(
        "sale_item__stock_item__category", "sale_item__stock_item__model", "processed_by"
    )
    if category:
        qs = qs.filter(sale_item__stock_item__category_id=category)
    if model:
        qs = qs.filter(sale_item__stock_item__model_id=model)
    if user:
        qs = qs.filter(processed_by_id=user)

    id_field, label_field = RETURNS_GROUP_BY_FIELDS[group_by]
    values_fields = (id_field,) if label_field is None else (id_field, label_field)
    grouped = qs.values(*values_fields).annotate(count=Count("id")).order_by("-count")
    rows = []
    for row in grouped:
        raw_key = row[id_field]
        if group_by == "category":
            label = RETURN_CATEGORY_LABELS.get(raw_key, raw_key)
        else:
            label = str(row.get(label_field) or raw_key)
        rows.append({"key": str(raw_key), "label": label, "count": row["count"]})
    return rows


STOCK_GROUP_BY_FIELDS = {
    "category": ("category_id", "category__name"),
    "model": ("model_id", "model__name"),
    "supplier": ("stock_in__supplier_id", "stock_in__supplier__name"),
}


def stock_rows(group_by="category", category=None, model=None, supplier=None):
    qs = StockItem.objects.select_related("category", "model", "stock_in__supplier")
    if category:
        qs = qs.filter(category_id=category)
    if model:
        qs = qs.filter(model_id=model)
    if supplier:
        qs = qs.filter(stock_in__supplier_id=supplier)

    id_field, label_field = STOCK_GROUP_BY_FIELDS[group_by]
    grouped = (
        qs.values(id_field, label_field)
        .annotate(quantity=Sum("quantity_remaining"), value=Sum(F("quantity_remaining") * F("buying_price")))
        .order_by("-value")
    )
    return [
        {
            "key": str(row[id_field]),
            "label": str(row[label_field]),
            "quantity": row["quantity"] or 0,
            "value": row["value"] or 0,
        }
        for row in grouped
    ]


def supplier_rows(date_from, date_to, supplier=None):
    qs = StockItem.objects.filter(
        stock_in__import_date__gte=date_from, stock_in__import_date__lte=date_to
    ).select_related("stock_in__supplier")
    if supplier:
        qs = qs.filter(stock_in__supplier_id=supplier)
    grouped = (
        qs.values("stock_in__supplier_id", "stock_in__supplier__name")
        # The output alias must not be named "quantity" — inside this same annotate()
        # call, Sum(F("quantity") * ...) would then resolve F("quantity") against the
        # newly-created "quantity" annotation instead of the raw field and Django
        # rejects nesting an aggregate inside another aggregate.
        .annotate(total_quantity=Sum("quantity"), value=Sum(F("quantity") * F("buying_price")))
        .order_by("-value")
    )
    return [
        {
            "key": str(row["stock_in__supplier_id"]),
            "label": row["stock_in__supplier__name"],
            "quantity": row["total_quantity"] or 0,
            "value": row["value"] or 0,
        }
        for row in grouped
    ]


LOSS_TYPE_LABELS = {
    "below_buying_price": "Below buying price",
    "below_minimum_price": "Below minimum price",
}


def loss_rows(date_from, date_to, **filters):
    """One row per sale that either lost money outright (net below buying price) or
    landed below the batch's floor price (net below min_selling_price, allowed as a
    soft-warning sale — see sales/serializers.py) — never both at once, buying-price
    loss is the more severe classification and wins."""
    qs = filtered_sale_items(date_from, date_to, **filters).select_related("sale")
    rows = []
    for item in qs:
        net = item.selling_price - item.discount
        buying_price = item.stock_item.buying_price
        min_price = item.stock_item.min_selling_price
        if net < buying_price:
            loss_type = "below_buying_price"
        elif net < min_price:
            loss_type = "below_minimum_price"
        else:
            continue
        rows.append(
            {
                "id": str(item.id),
                "imei": item.imei,
                "invoice_number": item.sale.invoice_number,
                "customer_name": item.sale.customer_name,
                "category_name": item.stock_item.category.name,
                "model_name": item.stock_item.model.name,
                "date": item.sale.created_at.date().isoformat(),
                "net_price": net,
                "buying_price": buying_price,
                "min_selling_price": min_price,
                "loss_type": loss_type,
                "loss_type_display": LOSS_TYPE_LABELS[loss_type],
            }
        )
    return rows


def _naive(dt):
    """openpyxl can't write timezone-aware datetimes ('Excel does not support
    timezones in datetimes') — convert to local wall-clock time and drop tzinfo."""
    return timezone.localtime(dt).replace(tzinfo=None) if dt else dt


def full_backup_sheets():
    """One tab per major model — a complete, human-readable snapshot of the
    system's data for offline backup / disaster recovery, not a re-importable
    dump (no re-import path exists for anything but stock — see stock/views.py's
    StockImportPreviewView). Sensitive fields (password hashes, session/JWT
    state) are deliberately excluded."""
    sheets = []

    sheets.append((
        "Categories",
        ("Name", "Created At"),
        [(c.name, _naive(c.created_at)) for c in Category.objects.order_by("name")],
    ))

    sheets.append((
        "Phone Models",
        ("Category", "Model", "Created At"),
        [(m.category.name, m.name, _naive(m.created_at)) for m in PhoneModel.objects.select_related("category").order_by("category__name", "name")],
    ))

    sheets.append((
        "Suppliers",
        ("Name", "Phone", "Email", "Address", "Notes", "Created At"),
        [(s.name, s.phone, s.email, s.address, s.notes, _naive(s.created_at)) for s in Supplier.objects.order_by("name")],
    ))

    stock_items = StockItem.objects.select_related("category", "model", "stock_in__supplier", "stock_in__created_by")
    sheets.append((
        "Stock Items",
        (
            "Category", "Model", "Supplier", "Import Date", "Quantity", "Quantity Remaining",
            "Buying Price", "Min Selling Price", "Max Selling Price", "Added By",
        ),
        [
            (
                item.category.name, item.model.name, item.stock_in.supplier.name, item.stock_in.import_date,
                item.quantity, item.quantity_remaining, item.buying_price, item.min_selling_price,
                item.max_selling_price, item.stock_in.created_by.get_full_name() or item.stock_in.created_by.username,
            )
            for item in stock_items.order_by("-stock_in__import_date")
        ],
    ))

    sheets.append((
        "Sales",
        ("Invoice", "Customer", "Customer Phone", "Payment Method", "Sold By", "Date"),
        [
            (s.invoice_number, s.customer_name, s.customer_phone, s.get_payment_method_display(), s.sold_by.get_full_name() or s.sold_by.username, _naive(s.created_at))
            for s in Sale.objects.select_related("sold_by").order_by("-created_at")
        ],
    ))

    sale_items = SaleItem.objects.select_related("sale", "stock_item__category", "stock_item__model")
    sheets.append((
        "Sale Items",
        ("Invoice", "Category", "Model", "IMEI", "Selling Price", "Discount"),
        [
            (item.sale.invoice_number, item.stock_item.category.name, item.stock_item.model.name, item.imei, item.selling_price, item.discount)
            for item in sale_items.order_by("-sale__created_at")
        ],
    ))

    returns = Return.objects.select_related("sale_item__sale", "sale_item__stock_item__category", "sale_item__stock_item__model", "processed_by")
    sheets.append((
        "Returns",
        ("Invoice", "Category", "Model", "IMEI", "Return Date", "Category of Issue", "Status", "Processed By", "Description"),
        [
            (
                r.sale_item.sale.invoice_number, r.sale_item.stock_item.category.name, r.sale_item.stock_item.model.name,
                r.sale_item.imei, r.return_date, r.get_return_category_display(), r.get_status_display(),
                r.processed_by.get_full_name() or r.processed_by.username, r.description,
            )
            for r in returns.order_by("-return_date")
        ],
    ))

    User = get_user_model()
    sheets.append((
        "Users",
        ("Username", "Full Name", "Phone", "Email", "Role", "Active", "Active Employee", "Superuser", "Created At"),
        [
            (u.username, u.get_full_name(), u.phone, u.email, u.role.name if u.role else "", u.is_active, u.is_active_employee, u.is_superuser, _naive(u.created_at))
            for u in User.objects.select_related("role").order_by("username")
        ],
    ))

    sheets.append((
        "Roles",
        ("Name", "Description", "Permissions", "System Role"),
        [
            (r.name, r.description, ", ".join(r.permissions.values_list("codename", flat=True)), r.is_system_role)
            for r in Role.objects.prefetch_related("permissions").order_by("name")
        ],
    ))

    sheets.append((
        "Activity Log",
        ("User", "Action", "Details", "IP Address", "Date"),
        [
            (log.user.username if log.user else "System", log.action, str(log.details), log.ip_address, _naive(log.created_at))
            for log in ActivityLog.objects.select_related("user").order_by("-created_at")
        ],
    ))

    return sheets


def person_report(user, date_from, date_to):
    stock_in_qs = StockIn.objects.filter(
        created_by=user, import_date__gte=date_from, import_date__lte=date_to
    )
    stock_items_qs = StockItem.objects.filter(stock_in__in=stock_in_qs)
    stock_totals = stock_items_qs.aggregate(qty=Sum("quantity"), value=Sum(F("quantity") * F("buying_price")))

    return {
        "stock_added": {
            "batches": stock_in_qs.count(),
            "quantity": stock_totals["qty"] or 0,
            "value": stock_totals["value"] or 0,
        },
        "sales_made": sales_totals(date_from, date_to, user=user.id),
        "returns_processed": Return.objects.filter(
            processed_by=user, return_date__gte=date_from, return_date__lte=date_to
        ).count(),
    }
