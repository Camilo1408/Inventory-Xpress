import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDoStockCount, canReopenDailyInventory } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

interface FinalCountItem {
  productId: string;
  finalCount: number;
  unregisteredEntry?: number | null;
  unregisteredExit?: number | null;
}

interface PatchBody {
  action?: string;
  reason?: string;
  finalCounts?: unknown;
}

/** PATCH /api/daily-inventory/[id]
 *  body { finalCounts: [...] }          → cerrar inventario
 *  body { action: "reopen" }            → reabrir inventario (solo ADMIN/SUPERADMIN)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !canDoStockCount(session.user.role, session.user.inventoryAccess)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as PatchBody;

  // ── Acción: reabrir ───────────────────────────────────────────────────────
  if (body.action === "reopen") {
    if (!canReopenDailyInventory(session.user.role)) {
      return NextResponse.json(
        { error: "Solo administradores pueden reabrir el inventario" },
        { status: 403 }
      );
    }

    const reason = body.reason?.trim() ?? "";
    if (!reason) {
      return NextResponse.json({ error: "Debes ingresar una justificación para reabrir" }, { status: 400 });
    }

    const inventory = await prisma.dailyInventory.findUnique({ where: { id } });
    if (!inventory) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
    if (inventory.status !== "closed") {
      return NextResponse.json({ error: "El inventario no está cerrado" }, { status: 409 });
    }

    // Los conteos finales se conservan para que puedan modificarse
    const reopened = await prisma.dailyInventory.update({
      where: { id },
      data: {
        status: "open",
        closedAt: null,
        closedBy: null,
        reopenedAt: new Date(),
        reopenedBy: session.user.name ?? session.user.username,
        reopenReason: reason,
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
        },
      },
    });

    return NextResponse.json({ inventory: reopened });
  }

  // ── Acción: cerrar (comportamiento original) ──────────────────────────────
  if (!Array.isArray(body.finalCounts) || body.finalCounts.length === 0) {
    return NextResponse.json({ error: "finalCounts es requerido y debe tener al menos un elemento" }, { status: 400 });
  }

  const finalCounts = body.finalCounts as FinalCountItem[];
  const invalid = finalCounts.some(
    (fc) =>
      typeof fc.productId !== "string" ||
      typeof fc.finalCount !== "number" ||
      fc.finalCount < 0 ||
      (fc.unregisteredEntry != null && (typeof fc.unregisteredEntry !== "number" || fc.unregisteredEntry < 0)) ||
      (fc.unregisteredExit  != null && (typeof fc.unregisteredExit  !== "number" || fc.unregisteredExit  < 0))
  );
  if (invalid) {
    return NextResponse.json({ error: "Datos inválidos en finalCounts" }, { status: 400 });
  }

  const inventory = await prisma.dailyInventory.findUnique({
    where: { id },
    include: { items: { select: { id: true, productId: true, initialCount: true } } },
  });

  if (!inventory) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
  if (inventory.status === "closed") {
    return NextResponse.json({ error: "Este inventario ya está cerrado" }, { status: 409 });
  }

  // Movimientos registrados del día — necesarios para auto-calcular las diferencias
  const dayStart0 = new Date(`${inventory.date}T00:00:00.000Z`);
  const dayEnd0   = new Date(`${inventory.date}T23:59:59.999Z`);
  const dayMovements = await prisma.stockMovement.findMany({
    where: {
      productId: { in: inventory.items.map((i) => i.productId) },
      type: { in: ["ENTRY", "EXIT"] },
      createdAt: { gte: dayStart0, lte: dayEnd0 },
    },
    select: { productId: true, type: true, quantity: true },
  });

  await Promise.all(
    finalCounts.map((fc: FinalCountItem) => {
      const item = inventory.items.find((i) => i.productId === fc.productId);
      if (!item) return Promise.resolve(null);

      // Si el usuario no especificó entrada/salida no registrada, derivar de la diferencia
      // entre el conteo real y el stock esperado.
      const hasEntry = fc.unregisteredEntry != null;
      const hasExit  = fc.unregisteredExit  != null;

      let unregisteredEntry = hasEntry ? fc.unregisteredEntry! : 0;
      let unregisteredExit  = hasExit  ? fc.unregisteredExit!  : 0;

      if (!hasEntry && !hasExit) {
        const entries = dayMovements
          .filter((m) => m.productId === fc.productId && m.type === "ENTRY")
          .reduce((s, m) => s + Math.abs(m.quantity), 0);
        const exits = dayMovements
          .filter((m) => m.productId === fc.productId && m.type === "EXIT")
          .reduce((s, m) => s + Math.abs(m.quantity), 0);
        const expected = item.initialCount + entries - exits;
        const diff = fc.finalCount - expected;
        if (diff > 0) unregisteredEntry = diff;
        else if (diff < 0) unregisteredExit = -diff;
      }

      return prisma.dailyInventoryItem.update({
        where: { id: item.id },
        data: {
          finalCount: fc.finalCount,
          unregisteredEntry,
          unregisteredExit,
        },
      });
    })
  );

  const closed = await prisma.dailyInventory.update({
    where: { id },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedBy: session.user.name ?? session.user.username,
    },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
      },
    },
  });

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
    const prods    = movements.filter((m) => m.productId === item.productId);
    const entries  = prods.filter((m) => m.type === "ENTRY").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const exits    = prods.filter((m) => m.type === "EXIT").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const expected = item.initialCount + entries - exits;
    const discrepancy = item.finalCount !== null ? item.finalCount - expected : null;
    return { ...item, entries, exits, expected, discrepancy };
  });

  return NextResponse.json({ inventory: { ...closed, items: itemsWithCalc } });
}
