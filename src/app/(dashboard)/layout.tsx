import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { canManageCategories, canManageUsers, canViewAudit, canViewReports, canDoStockCount, can, INV } from "@/lib/permissions";
import { config } from "@/lib/config";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const alertProducts = await prisma.product.findMany({
    where: { active: true, minStock: { gt: 0 } },
    select: { currentStock: true, minStock: true },
  }).catch(() => []);
  const alertCount = alertProducts.filter(p => p.currentStock <= p.minStock).length;

  const isStandalone = config.authMode === "standalone";
  const nominaUrl = process.env.NEXT_PUBLIC_NOMINA_APP_URL;

  return (
    <DashboardShell
      alertCount={alertCount}
      isStandalone={isStandalone}
      nominaUrl={nominaUrl}
      canManageCategories={canManageCategories(session.user)}
      canManageUsers={canManageUsers(session.user)}
      canViewAudit={canViewAudit(session.user)}
      canViewReports={canViewReports(session.user)}
      canDoStockCount={canDoStockCount(session.user)}
      canView={can(session.user, INV.VIEW)}
      featureDailyInventory={config.features.dailyInventory}
      userName={session.user.name ?? session.user.username}
      role={session.user.role}
    >
      {children}
    </DashboardShell>
  );
}
