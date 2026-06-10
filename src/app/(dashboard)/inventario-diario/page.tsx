import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canDoStockCount, canReopenDailyInventory } from "@/lib/permissions";
import { DailyInventoryClient } from "./daily-inventory-client";

export default async function InventarioDiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canDoStockCount(session.user.role, session.user.inventoryAccess)) redirect("/");

  const resolvedParams = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const rawDate = resolvedParams.date;
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  const existing = await prisma.dailyInventory.findUnique({
    where: { date },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
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
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { productId: true, type: true, quantity: true },
    });
  }

  const allProducts = await prisma.product.findMany({
    where: { active: true },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const history = await prisma.dailyInventory.findMany({
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
      isSuperAdmin={session.user.role === "SUPERADMIN"}
      canReopen={canReopenDailyInventory(session.user.role)}
      history={history}
    />
  );
}
