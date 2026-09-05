"""Generic export layer — every report view produces the same (headers, rows) shape,
so Excel/PDF generation is written once here rather than per report type."""

import io

import openpyxl
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BRAND_PRIMARY = colors.HexColor("#25B1FF")
ROW_ALT = colors.HexColor("#F7F8FC")
GRID = colors.HexColor("#E5E7EB")


def _write_sheet(sheet, headers, rows):
    sheet.append(list(headers))
    for row in rows:
        sheet.append(list(row))
    for column_cells in sheet.columns:
        width = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
        sheet.column_dimensions[column_cells[0].column_letter].width = min(max(width + 2, 10), 40)


def rows_to_xlsx(filename, headers, rows):
    workbook = openpyxl.Workbook()
    _write_sheet(workbook.active, headers, rows)

    response = HttpResponse(
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
    workbook.save(response)
    return response


def multi_sheet_xlsx(filename, sheets):
    """sheets: list of (sheet_name, headers, rows) — one tab per entry, in order."""
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    for sheet_name, headers, rows in sheets:
        sheet = workbook.create_sheet(title=sheet_name[:31])  # Excel's own sheet-name limit
        _write_sheet(sheet, headers, rows)

    response = HttpResponse(
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
    workbook.save(response)
    return response


def rows_to_pdf(filename, title, headers, rows):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4))
    styles = getSampleStyleSheet()
    elements = [Paragraph(title, styles["Title"]), Spacer(1, 12)]

    data = [list(headers)] + [[str(cell) for cell in row] for row in rows]
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_PRIMARY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, GRID),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    elements.append(table)
    doc.build(elements)

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}.pdf"'
    return response
