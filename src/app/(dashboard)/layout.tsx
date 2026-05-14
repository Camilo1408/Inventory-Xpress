import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

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

  const isStandalone = process.env.AUTH_MODE === "standalone";
  const nominaUrl = process.env.NEXT_PUBLIC_NOMINA_APP_URL;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        alertCount={alertCount}
        isStandalone={isStandalone}
        nominaUrl={nominaUrl}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          userName={session.user.name ?? session.user.username}
          role={session.user.role}
          isStandalone={isStandalone}
          nominaUrl={nominaUrl}
        />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
