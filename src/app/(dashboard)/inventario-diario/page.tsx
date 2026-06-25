import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { canViewDailyCategory, canDailyCategory } from "@/lib/permissions";
import { DailyInventoryClient } from "./daily-inventory-client";

const STATUS_BADGE: Record<string, string> = {
  none:   "bg-slate-100 text-slate-500 border-0",
  open:   "bg-amber-100 text-amber-700 border-0",
  closed: "bg-emerald-100 text-emerald-700 border-0",
};
const STATUS_LABEL: Record<string, string> = {
  none: "Sin iniciar",
  open: "En curso",
  closed: "Cerrado",
};

export default async function InventarioDiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; categoria?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const resolved = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rawDate = resolved.date;
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const slug = resolved.categoria;

  // Categorías raíz que el usuario puede ver
  const rootCategories = await prisma.category.findMany({
    where: { parentId: null, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  const accessible = rootCategories.filter(
    (c): c is { id: string; name: string; slug: string } =>
      !!c.slug && canViewDailyCategory(session.user, c.slug)
  );

  // ── Sin categoría seleccionada → selector de categorías ────────────────────
  if (!slug) {
    const todays = await prisma.dailyInventory.findMany({
      where: { date: today, categoryId: { in: accessible.map((c) => c.id) } },
      select: { categoryId: true, status: true },
    });
    const statusByCat = new Map(todays.map((t) => [t.categoryId, t.status]));

    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Inventario Diario</h1>
          <p className="text-slate-500 text-sm mt-1">Selecciona una categoría para gestionar su conteo del día</p>
        </div>

        {accessible.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <p className="text-slate-500 text-sm">No tienes acceso a ninguna categoría de inventario.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accessible.map((c) => {
              const status = statusByCat.get(c.id) ?? "none";
              return (
                <Link
                  key={c.id}
                  href={`/inventario-diario?categoria=${c.slug}`}
                  className="bg-white border border-slate-200 rounded-lg p-5 hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                      <ClipboardList className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                      <Badge className={`${STATUS_BADGE[status]} mt-1`}>{STATUS_LABEL[status]}</Badge>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Categoría seleccionada ────────────────────────────────────────────────
  const category = accessible.find((c) => c.slug === slug);
  if (!category) redirect("/unauthorized"); // sin permiso o no existe

  const children = await prisma.category.findMany({
    where: { parentId: category.id },
    select: { id: true },
  });
  const catIds = [category.id, ...children.map((c) => c.id)];

  const allProducts = await prisma.product.findMany({
    where: { active: true, categoryId: { in: catIds } },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const existing = await prisma.dailyInventory.findUnique({
    where: { date_categoryId: { date, categoryId: category.id } },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true, bottleLevel: true, reserveBottles: true, category: { select: { slug: true } } } } },
        orderBy: { product: { name: "asc" } },
      },
    },
  });

  let movements: { productId: string; type: string; quantity: number }[] = [];
  if (existing) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd   = new Date(`${date}T23:59:59.999Z`);
    movements = await prisma.stockMovement.findMany({
      where: {
        productId: { in: existing.items.map((i) => i.productId) },
        type: { in: ["ENTRY", "EXIT"] },
        source: null,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { productId: true, type: true, quantity: true },
    });
  }

  const history = await prisma.dailyInventory.findMany({
    where: { categoryId: category.id },
    orderBy: { date: "desc" },
    take: 60,
    select: { id: true, date: true, status: true, userName: true, closedBy: true },
  });

  return (
    <DailyInventoryClient
      date={date}
      today={today}
      existing={existing}
      movements={movements}
      allProducts={allProducts}
      category={category}
      canOpen={canDailyCategory(session.user, slug, "open")}
      canClose={canDailyCategory(session.user, slug, "close")}
      canReopen={canDailyCategory(session.user, slug, "edit")}
      history={history}
    />
  );
}
