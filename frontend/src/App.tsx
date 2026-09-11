import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./providers/AuthProvider";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { DashboardLayout } from "./layouts/DashboardLayout";

import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import CategoriesPage from "./pages/catalog/CategoriesPage";
import StockPage from "./pages/stock/StockPage";
import SalesPage from "./pages/sales/SalesPage";
import LoanSalesPage from "./pages/loans/LoanSalesPage";
import ReturnsPage from "./pages/returns/ReturnsPage";
import ReportsPage from "./pages/reports/ReportsPage";
import UsersPage from "./pages/users/UsersPage";
import RolesPage from "./pages/roles/RolesPage";
import SuppliersPage from "./pages/suppliers/SuppliersPage";
import ForcePasswordChangePage from "./pages/auth/ForcePasswordChangePage";
import ActivityLogPage from "./pages/logs/ActivityLogPage";
import BackupPage from "./pages/system/BackupPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/force-password-change"
              element={<ForcePasswordChangePage />}
            />

            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route element={<ProtectedRoute requires="add_stock" />}>
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/stock" element={<StockPage />} />
                </Route>
                <Route element={<ProtectedRoute requires="create_sales" />}>
                  <Route path="/sales" element={<SalesPage />} />
                </Route>
                <Route
                  element={
                    <ProtectedRoute
                      requires={["create_loan_sales", "edit_loan_sales", "delete_loan_sales", "record_loan_payments"]}
                    />
                  }
                >
                  <Route path="/loans" element={<LoanSalesPage />} />
                </Route>
                <Route element={<ProtectedRoute requires="create_returns" />}>
                  <Route path="/returns" element={<ReturnsPage />} />
                </Route>
                <Route element={<ProtectedRoute requires="view_reports" />}>
                  <Route path="/reports" element={<ReportsPage />} />
                </Route>
                <Route element={<ProtectedRoute adminOnly />}>
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/roles" element={<RolesPage />} />
                </Route>
                <Route element={<ProtectedRoute requires="manage_suppliers" />}>
                  <Route path="/suppliers" element={<SuppliersPage />} />
                </Route>
                <Route element={<ProtectedRoute requires={["view_logs", "manage_users"]} />}>
                  <Route path="/logs" element={<ActivityLogPage />} />
                </Route>
                <Route element={<ProtectedRoute adminOnly />}>
                  <Route path="/backup" element={<BackupPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
