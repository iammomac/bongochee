import openpyxl
from django.http import HttpResponse
from openpyxl.styles import Alignment, Font, PatternFill
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.serializers import CategorySerializer, PhoneModelSerializer
from catalog.services import get_or_create_category, get_or_create_model
from rbac.permissions import HasPermission
from stock.models import StockIn, StockItem
from stock.serializers import StockInSerializer, StockItemSerializer


class StockInViewSet(viewsets.ModelViewSet):
    queryset = StockIn.objects.select_related("supplier", "created_by").prefetch_related("items").all()
    serializer_class = StockInSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "add_stock"

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class StockItemViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Read-only for browsing/searching available stock, edit (PATCH/PUT) for
    correcting an existing line item's category/model/quantity/pricing, and delete
    for undoing a line entered by mistake. Deleting is only allowed before anything's
    been sold from it -- SaleItem.stock_item is on_delete=PROTECT, so a line that's
    ever had a sale against it can't be removed without orphaning that sale's record;
    perform_destroy below rejects that case with a clean error instead of a raw
    IntegrityError. No create here -- batches are created via StockInViewSet."""

    queryset = (
        StockItem.objects.select_related("stock_in__supplier", "category", "model")
        .all()
        .order_by("-stock_in__created_at")
    )
    serializer_class = StockItemSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = ("add_stock", "create_sales")
    filterset_fields = {
        "category": ["exact"],
        "model": ["exact"],
        "quantity_remaining": ["exact", "gt"],
    }
    search_fields = ["category__name", "model__name"]

    def get_permissions(self):
        if self.action in ("update", "partial_update"):
            self.required_permission = "edit_stock"
        elif self.action == "destroy":
            self.required_permission = "delete_stock"
        else:
            self.required_permission = ("add_stock", "create_sales")
        return super().get_permissions()

    def perform_destroy(self, instance):
        if instance.sale_items.exists():
            raise ValidationError({"detail": "Can't delete — some of this stock has already been sold."})
        instance.delete()


# Header synonyms accepted in an uploaded sheet, matched case-insensitively.
EXPECTED_COLUMNS = {
    "category": ("category", "brand"),
    "model": ("model", "phone model"),
    "quantity": ("quantity", "qty"),
    "buying_price": ("buying price", "buying_price", "cost"),
    "min_selling_price": ("min selling price", "minimum selling price", "min_selling_price"),
    "max_selling_price": ("max selling price", "maximum selling price", "max_selling_price"),
}


def _map_columns(header_row):
    """Map each expected field to the column index whose header matches one of its synonyms."""
    normalized = [str(cell).strip().lower() if cell is not None else "" for cell in header_row]
    column_map = {}
    for field, synonyms in EXPECTED_COLUMNS.items():
        for index, header in enumerate(normalized):
            if header in synonyms:
                column_map[field] = index
                break
    return column_map


def _parse_row(raw_row, column_map, row_number):
    def cell(field):
        index = column_map.get(field)
        return raw_row[index] if index is not None and index < len(raw_row) else None

    category_name = str(cell("category") or "").strip()
    model_name = str(cell("model") or "").strip()

    errors = []
    if not category_name:
        errors.append("Category is required")
    if not model_name:
        errors.append("Model is required")

    def to_number(field, label):
        value = cell(field)
        try:
            return float(value)
        except (TypeError, ValueError):
            errors.append(f"{label} must be a number")
            return None

    quantity = to_number("quantity", "Quantity")
    buying_price = to_number("buying_price", "Buying price")
    min_selling_price = to_number("min_selling_price", "Min selling price")
    max_selling_price = to_number("max_selling_price", "Max selling price")

    category = model = None
    if category_name:
        category, _ = get_or_create_category(category_name)
    if category and model_name:
        model, _ = get_or_create_model(category, model_name)

    return {
        "row_number": row_number,
        "category": CategorySerializer(category).data if category else None,
        "model": PhoneModelSerializer(model).data if model else None,
        "quantity": quantity,
        "buying_price": buying_price,
        "min_selling_price": min_selling_price,
        "max_selling_price": max_selling_price,
        "error": "; ".join(errors) if errors else None,
    }


COLUMN_LABELS = {
    "category": "Category",
    "model": "Model",
    "quantity": "Quantity",
    "buying_price": "Buying Price",
    "min_selling_price": "Min Selling Price",
    "max_selling_price": "Max Selling Price",
}

TEMPLATE_EXAMPLE_ROWS = [
    ("Samsung", "Galaxy A56", 10, 550000, 650000, 700000),
    ("Apple", "iPhone 13", 5, 900000, 1050000, 1150000),
]

HEADER_FILL = PatternFill(start_color="25B1FF", end_color="25B1FF", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)


class StockImportTemplateView(APIView):
    """Downloadable .xlsx matching exactly what StockImportPreviewView below expects —
    the column labels here are this same view's COLUMN_LABELS/EXPECTED_COLUMNS, so the
    two can never drift apart."""

    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "add_stock"

    def get(self, request):
        workbook = openpyxl.Workbook()

        template_sheet = workbook.active
        template_sheet.title = "Stock Import Template"
        headers = [COLUMN_LABELS[field] for field in EXPECTED_COLUMNS]
        template_sheet.append(headers)
        for cell in template_sheet[1]:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
        for row in TEMPLATE_EXAMPLE_ROWS:
            template_sheet.append(list(row))
        for column_cells in template_sheet.columns:
            width = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
            template_sheet.column_dimensions[column_cells[0].column_letter].width = min(max(width + 4, 12), 30)

        instructions_sheet = workbook.create_sheet("Instructions")
        instructions_sheet.column_dimensions["A"].width = 90
        instructions_lines = [
            "How to fill in this template",
            "",
            "1. Keep the column headers on row 1 of the 'Stock Import Template' sheet exactly as they are.",
            "2. Delete the two example rows before adding your own — they're only there to show the expected format.",
            "3. One row = one batch line: a phone model, at a given buying/selling price, at a given quantity.",
            "4. Category and Model are free text — if they don't already exist in the system, they'll be created automatically on import.",
            "5. Quantity, Buying Price, Min Selling Price, and Max Selling Price must all be plain numbers — no currency symbols, letters, or commas.",
            "6. Min Selling Price should be less than or equal to Max Selling Price.",
            "7. Save as .xlsx (not .xls or .csv) and upload it from the Stock page's 'Import from Excel' button.",
            "8. Uploading only loads the rows into the on-screen grid for review — nothing is saved until you press 'Save batch' there.",
        ]
        for line in instructions_lines:
            instructions_sheet.append([line])
        instructions_sheet["A1"].font = Font(bold=True, size=13)
        for row in instructions_sheet.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(wrap_text=True, vertical="top")

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="bongochee_stock_import_template.xlsx"'
        workbook.save(response)
        return response


class StockImportPreviewView(APIView):
    """Parses an uploaded spreadsheet into rows for review in the Stock In grid.
    Categories/models are resolved or created (same idempotent behavior as the
    manual pickers) but no StockIn/StockItem rows are written here — saving the
    batch is still an explicit, separate step."""

    permission_classes = [IsAuthenticated, HasPermission]
    required_permission = "add_stock"
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            workbook = openpyxl.load_workbook(file, read_only=True, data_only=True)
        except Exception:
            return Response(
                {"detail": "Could not read this file — is it a valid .xlsx?"}, status=status.HTTP_400_BAD_REQUEST
            )

        sheet = workbook.active
        rows_iter = sheet.iter_rows(values_only=True)
        header_row = next(rows_iter, None)
        if not header_row:
            return Response({"detail": "The file is empty"}, status=status.HTTP_400_BAD_REQUEST)

        column_map = _map_columns(header_row)
        missing = [field for field in EXPECTED_COLUMNS if field not in column_map]
        if missing:
            return Response(
                {"detail": f"Missing column(s): {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST
            )

        rows = []
        for row_number, raw_row in enumerate(rows_iter, start=2):
            if raw_row is None or all(cell is None for cell in raw_row):
                continue
            rows.append(_parse_row(raw_row, column_map, row_number))

        return Response({"rows": rows})
