import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  RotateCcw,
  HandCoins,
  BarChart3,
  Users,
  Shield,
  Truck,
  Tag,
  ScrollText,
  DatabaseBackup,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";
import logo from "../assets/logo-trimmed.png";
import logoBadge from "../assets/logo-badge.png";
import type { PermissionCode } from "../types";

const STORAGE_KEY = "bongochee-sidebar-collapsed";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, perm: "view_dashboard" as PermissionCode, adminOnly: false },
  { to: "/categories", label: "Categories", icon: Tag, perm: "add_stock" as PermissionCode, adminOnly: false },
  { to: "/stock", label: "Stock", icon: Package, perm: "add_stock" as PermissionCode, adminOnly: false },
  { to: "/sales", label: "Sales", icon: ShoppingCart, perm: "create_sales" as PermissionCode, adminOnly: false },
  {
    to: "/loans",
    label: "Loan Sales",
    icon: HandCoins,
    perm: ["create_loan_sales", "edit_loan_sales", "delete_loan_sales", "record_loan_payments"] as PermissionCode[],
    adminOnly: false,
  },
  { to: "/returns", label: "Returns", icon: RotateCcw, perm: "create_returns" as PermissionCode, adminOnly: false },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "view_reports" as PermissionCode, adminOnly: false },
  { to: "/users", label: "Users", icon: Users, perm: null, adminOnly: true },
  { to: "/roles", label: "Roles", icon: Shield, perm: null, adminOnly: true },
  { to: "/suppliers", label: "Suppliers", icon: Truck, perm: "manage_suppliers" as PermissionCode, adminOnly: false },
  {
    to: "/logs",
    label: "Activity Logs",
    icon: ScrollText,
    perm: ["view_logs", "manage_users"] as PermissionCode[],
    adminOnly: false,
  },
  { to: "/backup", label: "Backup & Restore", icon: DatabaseBackup, perm: null, adminOnly: true },
];

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { has, isAdminOrSuper } = usePermissions();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => (item.adminOnly ? isAdminOrSuper : has(item.perm!))).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${
              isActive
                ? "bg-primary/10 text-primary shadow-neu-primary dark:shadow-neu-primary-dark"
                : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            }`
          }
        >
          <Icon size={18} className="shrink-0" />
          {collapsed ? null : label}
        </NavLink>
      ))}
    </nav>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <>
      {/* Desktop rail — collapsible, hidden below md; the only nav surface on wide screens. */}
      <aside
        className={`relative hidden flex-col border-r border-gray-100 bg-white p-4 transition-[width] duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 md:flex ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-8 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-soft hover:text-primary dark:border-gray-700 dark:bg-gray-900"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <img
          src={collapsed ? logoBadge : logo}
          alt="Bongo Chee"
          className={collapsed ? "mb-8 h-10 w-10 self-center object-contain" : "mb-8 h-16 w-auto self-start px-2"}
        />

        <NavLinks collapsed={collapsed} />
      </aside>

      {/* Mobile drawer — below md the rail above is hidden entirely, so this is the
          only way to navigate on narrow viewports. Always full-width labels; the
          collapse/expand toggle only makes sense on the desktop rail. */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col overflow-y-auto bg-white p-4 shadow-2xl dark:bg-gray-900">
            <div className="mb-8 flex items-center justify-between">
              <img src={logo} alt="Bongo Chee" className="h-14 w-auto" />
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close menu"
                className="rounded-full p-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <NavLinks collapsed={false} onNavigate={onCloseMobile} />
          </div>
        </div>
      ) : null}
    </>
  );
}
