import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canDoStockCount } from "@/lib/permissions";
import { DailyInventoryClient } from "./daily-inventory-client";

export default async function InventarioDiarioPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canDoStockCount(session.user.role, session.user.inventoryAccess)) redirect("/");

  const today = new Date().toISOString().slice(0, 10);

  // Obtener inventario del día si existe
  const existing = await prisma.dailyInventory.findUnique({
    where: { date: today },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
        orderBy: { product: { name: "asc" } },
      },
    },
  });

  // Calcular entradas y salidas del día si ya existe inventario
  let movements: { productId: string; type: string; quantity: number }[] = [];
  if (existing) {
    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd   = new Date(`${today}T23:59:59.999Z`);
    movements = await prisma.stockMovement.findMany({
      where: {
        productId: { in: existing.items.map((i) => i.productId) },
        type: { in: ["ENTRY", "EXIT"] },
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { productId: true, type: true, quantity: true },
    });
  }

  // Listar todos los productos activos para el formulario de creación
  const allProducts = await prisma.product.findMany({
    where: { active: true },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <DailyInventoryClient
      date={today}
      existing={existing}
      movements={movements}
      allProducts={allProducts}
      isSuperAdmin={session.user.role === "SUPERADMIN"}
    />
  );
}
