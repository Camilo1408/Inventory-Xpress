import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDoStockCount } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const closeSchema = z.object({
  finalCounts: z.array(z.object({
    productId: z.string().min(1),
    finalCount: z.number().min(0),
  })).min(1),
});

/** PATCH /api/daily-inventory/[id] — registrar conteos finales y cerrar */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !canDoStockCount(session.user.role, session.user.inventoryAccess)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const inventory = await prisma.dailyInventory.findUnique({
    where: { id },
    include: { items: { select: { id: true, productId: true } } },
  });

  if (!inventory) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
  if (inventory.status === "closed") {
    return NextResponse.json({ error: "Este inventario ya está cerrado" }, { status: 409 });
  }

  const { finalCounts } = parsed.data;

  // Actualizar cada item con su conteo final
  await Promise.all(
    finalCounts.map((fc) => {
      const item = inventory.items.find((i) => i.productId === fc.productId);
      if (!item) return Promise.resolve();
      return prisma.dailyInventoryItem.update({
        where: { id: item.id },
        data: { finalCount: fc.finalCount },
      });
    })
  );

  // Cerrar el inventario
  const closed = await prisma.dailyInventory.update({
    where: { id },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedBy: session.user.name ?? session.user.username ?? "Usuario",
    },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
      },
    },
  });

  // Calcular diferencias para la respuesta
  const dayStart = new Date(`${inventory.date}T00:00:00.000Z`);
  const dayEnd   = new Date(`${inventory.date}T23:59:59.999Z`);

  const movements = await prisma.stockMovement.findMany({
    where: {
      productId: { in: closed.items.map((i) => i.productId) },
      type: { in: ["ENTRY", "EXIT"] },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    select: { productId: true, type: true, quantity: true },
  });

  const itemsWithCalc = closed.items.map((item) => {
    const prods = movements.filter((m) => m.productId === item.productId);
    const entries    = prods.filter((m) => m.type === "ENTRY").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const exits      = prods.filter((m) => m.type === "EXIT").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const expected   = item.initialCount + entries - exits;
    const discrepancy = item.finalCount !== null ? item.finalCount - expected : null;
    return { ...item, entries, exits, expected, discrepancy };
  });

  return NextResponse.json({ inventory: { ...closed, items: itemsWithCalc } });
}
