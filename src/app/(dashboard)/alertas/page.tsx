import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { needsRestock, isBottleLevel, bottleLevelMeta, isBottleTrackedSlug } from "@/lib/bottle";
import { AlertasClient } from "./alertas-client";

export default async function AlertasPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const products = await prisma.product.findMany({
    where: { active: true, minStock: { gt: 0 } },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const alerts = products
    .filter((p) => p.currentStock <= p.minStock)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      minStock: p.minStock,
      deficit: p.minStock - p.currentStock,
      quantityToOrder: p.minStock * 2 - p.currentStock,
      category: p.category?.name ?? "Sin categoría",
    }));

  const bottleProducts = await prisma.product.findMany({
    where: { active: true, bottleLevel: { not: null } },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const bottleAlerts = bottleProducts
    .filter((p) => isBottleTrackedSlug(p.category?.slug ?? null))
    .filter((p) =>
      needsRestock(
        isBottleLevel(p.bottleLevel) ? p.bottleLevel : null,
        p.reserveBottles,
        isBottleLevel(p.alertBottleLevel) ? p.alertBottleLevel : null
      )
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? "Cócteles",
      levelLabel: isBottleLevel(p.bottleLevel) ? bottleLevelMeta(p.bottleLevel).label : "—",
      reserve: p.reserveBottles ?? 0,
    }));

  const totalAlerts = alerts.length + bottleAlerts.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Alertas de stock</h1>
        <p className="text-slate-500 text-sm mt-1">
          {totalAlerts > 0
            ? `${totalAlerts} alerta${totalAlerts !== 1 ? "s" : ""} de reposición`
            : "Todo el stock está en orden"}
        </p>
      </div>
      <AlertasClient alerts={alerts} bottleAlerts={bottleAlerts} />
    </div>
  );
}
