import io
from datetime import date

import openpyxl
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Category, PhoneModel
from rbac.models import Permission, Role
from returns_app.models import Return
from sales.models import Sale, SaleItem
from stock.models import StockIn, StockItem
from suppliers.models import Supplier


class DashboardSummaryTests(APITestCase):
    def setUp(self):
        perm = Permission.objects.create(codename="view_dashboard", label="View Dashboard", category="general")
        role = Role.objects.create(name="Viewer")
        role.permissions.add(perm)
        self.user = User.objects.create_user(
            username="viewer",
            password="Str0ngPassw0rd!",
            phone="255700000021",
            role=role,
            must_change_password=False,
        )
        self.client.force_authenticate(self.user)

        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        supplier = Supplier.objects.create(name="Blue Telecom")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.user)
        stock_item = StockItem.objects.create(
            stock_in=stock_in,
            category=category,
            model=model,
            quantity=5,
            quantity_remaining=5,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )
        sale = Sale.objects.create(
            invoice_number="INV-1", customer_name="Walk-in", payment_method="cash", sold_by=self.user
        )
        self.sale_item = SaleItem.objects.create(
            sale=sale, stock_item=stock_item, imei="123456789012345", selling_price="650000", discount="50000"
        )

    def test_revenue_trend_nets_out_discount(self):
        res = self.client.get("/api/v1/reports/dashboard-summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        trend = res.json()["revenueTrend"]
        self.assertEqual(len(trend), 14)
        dates = [point["date"] for point in trend]
        self.assertEqual(dates, sorted(dates))
        today_point = trend[-1]
        self.assertEqual(today_point["date"], date.today().isoformat())
        # 650000 sold - 50000 discount = 600000 net revenue for the day.
        self.assertEqual(float(today_point["revenue"]), 600000.0)

    def test_todays_profit_nets_out_discount(self):
        res = self.client.get("/api/v1/reports/dashboard-summary/")
        # net revenue 600000 - buying_price 500000 = 100000 profit.
        self.assertEqual(float(res.json()["todaysProfit"]), 100000.0)

    def test_todays_returns_reflects_real_data(self):
        Return.objects.create(
            sale_item=self.sale_item,
            return_date=date.today(),
            return_category="battery",
            processed_by=self.user,
        )
        res = self.client.get("/api/v1/reports/dashboard-summary/")
        self.assertEqual(res.json()["todaysReturns"], 1)


class ReportEndpointsTests(APITestCase):
    def setUp(self):
        self.view_reports = Permission.objects.create(codename="view_reports", label="View Reports", category="reports")
        self.export_reports = Permission.objects.create(
            codename="export_reports", label="Export Reports", category="reports"
        )
        self.view_profit = Permission.objects.create(codename="view_profit", label="View Profit", category="reports")
        self.manage_users = Permission.objects.create(codename="manage_users", label="Manage Users", category="admin")

        viewer_role = Role.objects.create(name="ReportViewer")
        viewer_role.permissions.add(self.view_reports)
        self.viewer = User.objects.create_user(
            username="reportviewer",
            password="Str0ngPassw0rd!",
            phone="255700000070",
            role=viewer_role,
            must_change_password=False,
        )

        full_role = Role.objects.create(name="ReportFull")
        full_role.permissions.add(self.view_reports, self.export_reports, self.view_profit, self.manage_users)
        self.full_user = User.objects.create_user(
            username="reportfull",
            password="Str0ngPassw0rd!",
            phone="255700000071",
            role=full_role,
            must_change_password=False,
        )

        salesperson_role = Role.objects.create(name="Salesperson")
        self.salesperson = User.objects.create_user(
            username="salesperson1",
            password="Str0ngPassw0rd!",
            phone="255700000072",
            role=salesperson_role,
            must_change_password=False,
        )

        self.supplier = Supplier.objects.create(name="Blue Telecom")
        self.category = Category.objects.create(name="Samsung")
        self.model = PhoneModel.objects.create(category=self.category, name="Galaxy A56")
        self.stock_in = StockIn.objects.create(
            supplier=self.supplier, import_date=date.today(), created_by=self.salesperson
        )
        self.stock_item = StockItem.objects.create(
            stock_in=self.stock_in,
            category=self.category,
            model=self.model,
            quantity=10,
            quantity_remaining=7,
            buying_price="500000",
            min_selling_price="600000",
            max_selling_price="700000",
        )

        sale = Sale.objects.create(
            invoice_number="INV-REPORT-1", customer_name="Walk-in", payment_method="cash", sold_by=self.salesperson
        )
        # Profitable: net 650000, well above both buying (500000) and min (600000).
        self.profitable_item = SaleItem.objects.create(
            sale=sale, stock_item=self.stock_item, imei="100000000000001", selling_price="650000", discount="0"
        )
        # Below buying price: net 480000 < buying_price 500000 — a true loss.
        self.below_buying_item = SaleItem.objects.create(
            sale=sale, stock_item=self.stock_item, imei="100000000000002", selling_price="480000", discount="0"
        )
        # Below minimum price only: net 550000 — above buying (500000) but below min (600000).
        self.below_minimum_item = SaleItem.objects.create(
            sale=sale, stock_item=self.stock_item, imei="100000000000003", selling_price="650000", discount="100000"
        )

        Return.objects.create(
            sale_item=self.profitable_item,
            return_date=date.today(),
            return_category="battery",
            processed_by=self.salesperson,
        )

        self.client.force_authenticate(self.full_user)

    def _range(self):
        today = date.today().isoformat()
        return {"date_from": today, "date_to": today}

    def test_sales_summary_totals(self):
        res = self.client.get("/api/v1/reports/sales-summary/", self._range())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        totals = res.json()["totals"]
        self.assertEqual(totals["units"], 3)
        # net revenue = 650000 + 480000 + 550000 = 1680000
        self.assertEqual(float(totals["revenue"]), 1680000.0)

    def test_sales_summary_group_by_category(self):
        res = self.client.get("/api/v1/reports/sales-summary/", {**self._range(), "group_by": "category"})
        rows = res.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["label"], "Samsung")
        self.assertEqual(rows[0]["units"], 3)

    def test_loss_report_classifies_both_types(self):
        res = self.client.get("/api/v1/reports/loss/", self._range())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.json()["rows"]
        self.assertEqual(len(rows), 2)
        types = {row["imei"]: row["lossTypeDisplay"] for row in rows}
        self.assertEqual(types["100000000000002"], "Below buying price")
        self.assertEqual(types["100000000000003"], "Below minimum price")

    def test_stock_summary_by_category(self):
        res = self.client.get("/api/v1/reports/stock-summary/", {"group_by": "category"})
        rows = res.json()["rows"]
        self.assertEqual(rows[0]["label"], "Samsung")
        self.assertEqual(rows[0]["quantity"], 7)

    def test_supplier_summary(self):
        res = self.client.get("/api/v1/reports/supplier-summary/", self._range())
        rows = res.json()["rows"]
        self.assertEqual(rows[0]["label"], "Blue Telecom")
        self.assertEqual(rows[0]["quantity"], 10)

    def test_returns_summary_by_category(self):
        res = self.client.get("/api/v1/reports/returns-summary/", self._range())
        rows = res.json()["rows"]
        self.assertEqual(rows[0]["count"], 1)

    def test_person_report_shape(self):
        res = self.client.get(f"/api/v1/reports/person/{self.salesperson.id}/", self._range())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body["stockAdded"]["batches"], 1)
        self.assertEqual(body["salesMade"]["units"], 3)
        self.assertEqual(body["returnsProcessed"], 1)

    def test_export_requires_export_reports_permission(self):
        self.client.force_authenticate(self.viewer)
        res = self.client.get("/api/v1/reports/sales-summary/", {**self._range(), "export": "xlsx"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res = self.client.get("/api/v1/reports/sales-summary/", self._range())
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_export_xlsx_returns_file(self):
        res = self.client.get("/api/v1/reports/sales-summary/", {**self._range(), "export": "xlsx"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("spreadsheetml", res["Content-Type"])

    def test_export_pdf_returns_file(self):
        res = self.client.get("/api/v1/reports/sales-summary/", {**self._range(), "export": "pdf"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/pdf")

    def test_view_profit_gates_profit_data(self):
        self.client.force_authenticate(self.viewer)  # has view_reports but not view_profit
        res = self.client.get("/api/v1/reports/sales-summary/", self._range())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("profit", res.json()["totals"])

        res = self.client.get("/api/v1/reports/loss/", self._range())
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class FullBackupExportTests(APITestCase):
    """Admin/super only, by design — even a custom role holding every report
    permission there is (view_reports, export_reports, view_profit) must NOT get
    in, since this covers everything including user accounts and the audit log."""

    def setUp(self):
        admin_role = Role.objects.create(name="Admin", is_system_role=True)
        self.admin = User.objects.create_user(
            username="backupadmin", password="Str0ngPassw0rd!", phone="255700000023", role=admin_role, must_change_password=False
        )

        all_report_perms = Role.objects.create(name="ReportsPowerUser")
        for codename in ("view_reports", "export_reports", "view_profit"):
            perm = Permission.objects.create(codename=codename, label=codename, category="reports")
            all_report_perms.permissions.add(perm)
        self.power_user = User.objects.create_user(
            username="powerreports", password="Str0ngPassw0rd!", phone="255700000024", role=all_report_perms, must_change_password=False
        )

        category = Category.objects.create(name="Samsung")
        model = PhoneModel.objects.create(category=category, name="Galaxy A56")
        supplier = Supplier.objects.create(name="Blue Telecom")
        stock_in = StockIn.objects.create(supplier=supplier, import_date=date.today(), created_by=self.admin)
        StockItem.objects.create(
            stock_in=stock_in, category=category, model=model, quantity=2, quantity_remaining=2,
            buying_price="500000", min_selling_price="600000", max_selling_price="700000",
        )

    def test_admin_can_download_full_backup(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/v1/reports/full-backup/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("spreadsheetml", res["Content-Type"])

        workbook = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertIn("Stock Items", workbook.sheetnames)
        self.assertIn("Sales", workbook.sheetnames)
        self.assertIn("Users", workbook.sheetnames)
        self.assertIn("Roles", workbook.sheetnames)
        self.assertIn("Activity Log", workbook.sheetnames)

    def test_custom_role_with_every_report_permission_is_still_denied(self):
        self.client.force_authenticate(self.power_user)
        res = self.client.get("/api/v1/reports/full-backup/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
