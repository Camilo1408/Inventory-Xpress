"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface DashboardShellProps {
  alertCount: number;
  isStandalone: boolean;
  nominaUrl?: string;
  canManageCategories: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  canViewReports: boolean;
  canDoStockCount: boolean;
  canView: boolean;
  userName: string;
  role: string;
  children: React.ReactNode;
}

export function DashboardShell({
  alertCount,
  isStandalone,
  nominaUrl,
  canManageCategories,
  canManageUsers,
  canViewAudit,
  canViewReports,
  canDoStockCount,
  canView,
  userName,
  role,
  children,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Overlay para cerrar el drawer en móvil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar
        alertCount={alertCount}
        isStandalone={isStandalone}
        nominaUrl={nominaUrl}
        canManageCategories={canManageCategories}
        canManageUsers={canManageUsers}
        canViewAudit={canViewAudit}
        canViewReports={canViewReports}
        canDoStockCount={canDoStockCount}
        canView={canView}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          userName={userName}
          role={role}
          isStandalone={isStandalone}
          nominaUrl={nominaUrl}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
