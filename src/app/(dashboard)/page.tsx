import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, Bell, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatStock, getStockStatus } from "@/lib/utils";
import { needsRestock, isBottleLevel, isBottleTrackedSlug } from "@/lib/bottle";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalProducts,
    alertProducts,
    bottleAlertProducts,
    todayMovements,
    recentMovements,
  ] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.product.findMany({
      where: { active: true, minStock: { gt: 0 } },
      select: { currentStock: true, minStock: true },
    }),
    prisma.product.findMany({
      where: { active: true, bottleLevel: { not: null } },
      select: { bottleLevel: true, reserveBottles: true, alertBottleLevel: true, category: { select: { slug: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { createdAt: { gte: today } },
      select: { type: true, quantity: true },
    }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { product: { select: { name: true, unit: true } } },
    }),
  ]);

  const alertCount = alertProducts.filter((p) => p.currentStock <= p.minStock).length;
  const bottleAlertCount = bottleAlertProducts.filter(
    (p) =>
      isBottleTrackedSlug(p.category?.slug ?? null) &&
      needsRestock(
        isBottleLevel(p.bottleLevel) ? p.bottleLevel : null,
        p.reserveBottles,
        isBottleLevel(p.alertBottleLevel) ? p.alertBottleLevel : null
      )
  ).length;
  const totalAlerts = alertCount + bottleAlertCount;
  const entradasHoy = todayMovements.filter((m) => m.type === "ENTRY").length;
  const salidasHoy = todayMovements.filter((m) => m.type === "EXIT").length;

  const lowStockProducts = await prisma.product.findMany({
    where: { active: true, minStock: { gt: 0 } },
    include: { category: { select: { name: true } } },
    orderBy: { name: "asc" },
  }).then((products) => products.filter((p) => p.currentStock <= p.minStock).slice(0, 8));

  const stats = [
    { label: "Productos activos", value: totalProducts, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Alertas de stock", value: totalAlerts, icon: Bell, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Entradas hoy", value: entradasHoy, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Salidas hoy", value: salidasHoy, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
  ];

  const typeBadge: Record<string, string> = {
    ENTRY: "bg-blue-100 text-blue-700 border-0",
    EXIT: "bg-red-100 text-red-700 border-0",
    ADJUSTMENT: "bg-slate-100 text-slate-600 border-0",
  };
  const typeLabel: Record<string, string> = { ENTRY: "Entrada", EXIT: "Salida", ADJUSTMENT: "Ajuste" };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Bienvenido, {session.user.name ?? session.user.username}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-lg p-5">
            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{stat.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Alertas */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Stock bajo mínimo</h2>
            {alertCount > 0 && (
              <Link href="/alertas" className="text-xs text-blue-600 hover:underline">
                Ver todos ({alertCount})
              </Link>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {lowStockProducts.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                Todo el stock está en orden ✓
              </div>
            ) : (
              lowStockProducts.map((p) => {
                const status = getStockStatus(p.currentStock, p.minStock);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.category?.name ?? "Sin categoría"}</div>
                    </div>
                    <div className="text-sm tabular-nums font-medium text-slate-700">
                      {formatStock(p.currentStock, p.unit)}
                    </div>
                    <Badge className={
                      status === "empty"
                        ? "bg-red-100 text-red-700 border-0"
                        : "bg-amber-100 text-amber-700 border-0"
                    }>
                      {status === "empty" ? "Sin stock" : "Bajo mínimo"}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Movimientos recientes */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Movimientos recientes</h2>
            <Link href="/movimientos/historial" className="text-xs text-blue-600 hover:underline">
              Ver historial
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentMovements.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No hay movimientos aún
              </div>
            ) : (
              recentMovements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{m.product.name}</div>
                    <div className="text-xs text-slate-400">{formatDate(m.createdAt)}</div>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${m.quantity >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {m.quantity >= 0 ? "+" : ""}
                    {formatStock(m.quantity, m.product.unit)}
                  </span>
                  <Badge className={typeBadge[m.type] ?? ""}>
                    {typeLabel[m.type] ?? m.type}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
