import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { needsRestock, isBottleLevel, bottleLevelMeta, isBottleTrackedSlug } from "@/lib/bottle";
import { AlertasClient } from "./alertas-client";

export default async function AlertasPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const catInclude = {
    select: {
      name: true,
      slug: true,
      sortOrder: true,
      parentId: true,
      parent: { select: { name: true, sortOrder: true } },
    },
  } as const;

  const [numericProducts, bottleProducts] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, minStock: { gt: 0 } },
      include: { category: catInclude },
      orderBy: [{ category: { parent: { sortOrder: "asc" } } }, { category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.product.findMany({
      where: { active: true, bottleLevel: { not: null } },
      include: { category: catInclude },
      orderBy: [{ category: { parent: { sortOrder: "asc" } } }, { category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
  ]);

  function catNames(cat: { name: string; parentId: string | null; parent: { name: string } | null } | null) {
    if (!cat) return { root: "Sin categoría", sub: "Sin categoría" };
    return cat.parentId
      ? { root: cat.parent?.name ?? cat.name, sub: cat.name }
      : { root: cat.name, sub: cat.name };
  }

  const alerts = numericProducts
    .filter((p) => p.currentStock <= p.minStock)
    .map((p) => {
      const { root, sub } = catNames(p.category);
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        currentStock: p.currentStock,
        minStock: p.minStock,
        deficit: p.minStock - p.currentStock,
        quantityToOrder: p.minStock * 2 - p.currentStock,
        rootCategory: root,
        subCategory: sub,
      };
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
    .map((p) => {
      const { root, sub } = catNames(p.category);
      return {
        id: p.id,
        name: p.name,
        rootCategory: root,
        subCategory: sub,
        levelLabel: isBottleLevel(p.bottleLevel) ? bottleLevelMeta(p.bottleLevel).label : "—",
        reserve: p.reserveBottles ?? 0,
      };
    });

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
