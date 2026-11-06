import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background dark:bg-gray-950">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      {/* min-w-0: a flex item never shrinks below its content's width by default, so
          without it one wide table stretches this column -- and the whole page -- past the
          window instead of scrolling inside its own box. h-screen above (not min-h-screen) +
          overflow-y-auto here keeps the sidebar fixed in place while only this column scrolls. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
