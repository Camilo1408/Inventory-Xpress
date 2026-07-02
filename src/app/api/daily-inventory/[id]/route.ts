import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDailyCategory, canDoStockCount, canReopenDailyInventory, type DailyAction } from "@/lib/permissions";
import { isBottleTrackedSlug, isBottleLevel, bottleStock } from "@/lib/bottle";
import { audit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

interface FinalCountItem {
  productId: string;
  finalCount: number;
  unregisteredEntry?: number | null;
  unregisteredExit?: number | null;
  entryReason?: string | null; // motivo de la entrada no registrada
  entryTime?: string | null;   // hora de ingreso "HH:MM"
  bottleLevel?: string | null;
  reserveBottles?: number | null;
}

interface PatchBody {
  action?: string;
  reason?: string;
  finalCounts?: unknown;
}

/** PATCH /api/daily-inventory/[id]
 *  body { finalCounts: [...] }          → cerrar inventario (permiso :close de la categoría)
 *  body { action: "reopen" }            → reabrir inventario (permiso :edit de la categoría)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as PatchBody;

  // Resolver la categoría del registro para el gate por categoría.
  // Registros legados (categoryId NULL) caen a los gates globales previos.
  const meta = await prisma.dailyInventory.findUnique({ where: { id }, select: { categoryId: true } });
  if (!meta) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });

  let categorySlug: string | null = null;
  let categoryName: string | null = null;
  if (meta.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: meta.categoryId }, select: { slug: true, name: true } });
    categorySlug = cat?.slug ?? null;
    categoryName = cat?.name ?? null;
  }

  const userId   = session.user.id;
  const userName = session.user.name ?? session.user.username;

  const allowed = (action: Extract<DailyAction, "close" | "edit">) =>
    categorySlug
      ? canDailyCategory(session.user, categorySlug, action)
      : action === "edit"
      ? canReopenDailyInventory(session.user)
      : canDoStockCount(session.user);

  // ── Acción: reabrir ───────────────────────────────────────────────────────
  if (body.action === "reopen") {
    if (!allowed("edit")) {
      await audit({
        action: "access.denied", entityType: "DailyInventory", entityId: id,
        categoryId: meta.categoryId, categoryName, userId, userName,
        summary: `Intento de reabrir inventario${categoryName ? ` de ${categoryName}` : ""} sin permiso`, result: "denied",
      });
      return NextResponse.json({ error: "Sin permiso para reabrir esta categoría" }, { status: 403 });
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
        reopenedBy: userName,
        reopenReason: reason,
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
        },
      },
    });

    await audit({
      action: "daily.reopen", entityType: "DailyInventory", entityId: id,
      categoryId: meta.categoryId, categoryName, userId, userName,
      summary: `Reapertura de inventario${categoryName ? ` de ${categoryName}` : ""}. Motivo: ${reason}`,
    });

    return NextResponse.json({ inventory: reopened });
  }

  // ── Acción: cerrar ────────────────────────────────────────────────────────
  if (!allowed("close")) {
    await audit({
      action: "access.denied", entityType: "DailyInventory", entityId: id,
      categoryId: meta.categoryId, categoryName, userId, userName,
      summary: `Intento de cerrar inventario${categoryName ? ` de ${categoryName}` : ""} sin permiso`, result: "denied",
    });
    return NextResponse.json({ error: "Sin permiso para cerrar esta categoría" }, { status: 403 });
  }

  if (!Array.isArray(body.finalCounts) || body.finalCounts.length === 0) {
    return NextResponse.json({ error: "finalCounts es requerido y debe tener al menos un elemento" }, { status: 400 });
  }

  const finalCounts = body.finalCounts as FinalCountItem[];

  const inventory = await prisma.dailyInventory.findUnique({
    where: { id },
    include: { items: { select: { id: true, productId: true, initialCount: true } } },
  });

  if (!inventory) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
  if (inventory.status === "closed") {
    return NextResponse.json({ error: "Este inventario ya está cerrado" }, { status: 409 });
  }

  // Resolver qué productos del inventario son de control por botella (slug de su subcategoría).
  const invProducts = await prisma.product.findMany({
    where: { id: { in: inventory.items.map((i) => i.productId) } },
    select: { id: true, category: { select: { slug: true } } },
  });
  const bottleProductIds = new Set(
    invProducts.filter((p) => isBottleTrackedSlug(p.category?.slug)).map((p) => p.id)
  );

  const invalid = finalCounts.some((fc) => {
    if (typeof fc.productId !== "string") return true;
    if (bottleProductIds.has(fc.productId)) {
      if (fc.bottleLevel != null && !isBottleLevel(fc.bottleLevel)) return true;
      if (fc.reserveBottles != null && (typeof fc.reserveBottles !== "number" || fc.reserveBottles < 0 || !Number.isInteger(fc.reserveBottles))) return true;
      return false;
    }
    return (
      typeof fc.finalCount !== "number" ||
      fc.finalCount < 0 ||
      (fc.unregisteredEntry != null && (typeof fc.unregisteredEntry !== "number" || fc.unregisteredEntry < 0)) ||
      (fc.unregisteredExit  != null && (typeof fc.unregisteredExit  !== "number" || fc.unregisteredExit  < 0))
    );
  });
  if (invalid) {
    return NextResponse.json({ error: "Datos inválidos en finalCounts" }, { status: 400 });
  }

  // Movimientos registrados del día (solo manuales: source=null) — base para el "esperado".
  // Se excluyen los auto-generados por el inventario diario para no contarlos dos veces.
  const dayStart0 = new Date(`${inventory.date}T00:00:00.000Z`);
  const dayEnd0   = new Date(`${inventory.date}T23:59:59.999Z`);
  const dayMovements = await prisma.stockMovement.findMany({
    where: {
      productId: { in: inventory.items.map((i) => i.productId) },
      type: { in: ["ENTRY", "EXIT"] },
      source: null,
      createdAt: { gte: dayStart0, lte: dayEnd0 },
    },
    select: { productId: true, type: true, quantity: true },
  });

  // Movimientos auto-generados por cierres previos — se editan en vez de duplicar.
  const itemIds = inventory.items.map((i) => i.id);
  const closeSources = ["daily_nr_entry", "daily_nr_exit", "daily_close_adjust"];
  const existingAuto = await prisma.stockMovement.findMany({
    where: { dailyInventoryItemId: { in: itemIds }, source: { in: closeSources } },
    select: { id: true, dailyInventoryItemId: true, source: true, quantity: true },
  });
  const autoByKey = new Map<string, { id: string; quantity: number }>();
  const autoSumByItem = new Map<string, number>();
  for (const m of existingAuto) {
    autoByKey.set(`${m.dailyInventoryItemId}:${m.source}`, { id: m.id, quantity: m.quantity });
    autoSumByItem.set(m.dailyInventoryItemId!, (autoSumByItem.get(m.dailyInventoryItemId!) ?? 0) + m.quantity);
  }

  // Stock actual por producto — base para garantizar que el cierre deje el stock
  // exactamente en el conteo final, sin depender de que el stock previo == esperado.
  const stockRows = await prisma.product.findMany({
    where: { id: { in: inventory.items.map((i) => i.productId) } },
    select: { id: true, currentStock: true },
  });
  const stockByProduct = new Map(stockRows.map((p) => [p.id, p.currentStock]));

  // Pre-cálculo de NR (manual + auto-derivado) y validación de la justificación.
  const computed = finalCounts
    .map((fc) => ({ fc, item: inventory.items.find((i) => i.productId === fc.productId) }))
    .filter((c): c is { fc: FinalCountItem; item: (typeof inventory.items)[number] } => !!c.item)
    .filter((c) => !bottleProductIds.has(c.fc.productId)) // los de botella se procesan aparte
    .map(({ fc, item }) => {
      const hasEntry = fc.unregisteredEntry != null;
      const hasExit  = fc.unregisteredExit  != null;
      let e = hasEntry ? fc.unregisteredEntry! : 0;
      let x = hasExit  ? fc.unregisteredExit!  : 0;

      const regEntries = dayMovements
        .filter((m) => m.productId === fc.productId && m.type === "ENTRY")
        .reduce((s, m) => s + Math.abs(m.quantity), 0);
      const regExits = dayMovements
        .filter((m) => m.productId === fc.productId && m.type === "EXIT")
        .reduce((s, m) => s + Math.abs(m.quantity), 0);
      const expected = item.initialCount + regEntries - regExits;

      // Auto-cálculo: la diferencia que reste tras aplicar las NR manuales se
      // atribuye al lado que el usuario NO ingresó — sobrante → entrada,
      // faltante → salida — de modo que el conteo real quede explicado sin residual.
      const gap = fc.finalCount - (expected + e - x);
      if (!hasEntry && gap > 0) e += gap;
      if (!hasExit  && gap < 0) x += -gap;

      const entryReason = (fc.entryReason ?? "").trim() || null;
      const entryTime   = (fc.entryTime ?? "").trim() || null;

      return { item, finalCount: fc.finalCount, e, x, entryReason, entryTime };
    });

  // Las entradas no registradas exigen motivo y hora de ingreso (trazabilidad).
  if (computed.some((c) => c.e > 0 && (!c.entryReason || !c.entryTime))) {
    return NextResponse.json(
      { error: "Las entradas no registradas requieren motivo y hora de ingreso" },
      { status: 400 }
    );
  }

  // Cierre transaccional: persistir conteos, generar/editar movimientos y ajustar stock por delta.
  await prisma.$transaction(async (tx) => {
    for (const c of computed) {
      const { item, finalCount, e, x, entryReason, entryTime } = c;

      // Stock base = stock actual SIN los movimientos de cierres previos de este ítem.
      // Garantiza idempotencia al recerrar y que el stock final == conteo final.
      const baseStock = (stockByProduct.get(item.productId) ?? 0) - (autoSumByItem.get(item.id) ?? 0);
      const residual = finalCount - baseStock - e + x;

      await tx.dailyInventoryItem.update({
        where: { id: item.id },
        data: {
          finalCount,
          unregisteredEntry: e,
          unregisteredExit: x,
          unregEntryReason: e > 0 ? entryReason : null,
          unregEntryTime:   e > 0 ? entryTime   : null,
        },
      });

      const entryNote = e > 0
        ? `Entrada no registrada — inventario diario ${inventory.date}. Hora: ${entryTime}. Motivo: ${entryReason}`
        : `Entrada no registrada — inventario diario ${inventory.date}`;

      // Movimientos auto-generados (qty con signo). currentStock se ajusta por el delta
      // respecto al valor previo, de modo que recerrar edite en lugar de duplicar.
      const targets = [
        { source: "daily_nr_entry",     type: "ENTRY",      qty: e,        note: entryNote },
        { source: "daily_nr_exit",      type: "EXIT",       qty: -x,       note: `Salida no registrada — inventario diario ${inventory.date}` },
        { source: "daily_close_adjust", type: "ADJUSTMENT", qty: residual, note: `Ajuste por diferencia residual — inventario diario ${inventory.date}` },
      ];

      for (const t of targets) {
        const existing = autoByKey.get(`${item.id}:${t.source}`);
        const oldQty = existing?.quantity ?? 0;
        const delta = t.qty - oldQty;

        if (existing) {
          // Editar el registro existente (preserva el id / historial).
          await tx.stockMovement.update({
            where: { id: existing.id },
            data: { quantity: t.qty, type: t.type, notes: t.note },
          });
        } else if (t.qty !== 0) {
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: t.type,
              quantity: t.qty,
              notes: t.note,
              userId,
              userName,
              dailyInventoryItemId: item.id,
              source: t.source,
            },
          });
        }

        if (delta !== 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: delta } },
          });
        }
      }
    }

    // Ítems de botella: persistir snapshot en el item y reflejarlo en el producto.
    // No generan StockMovement ni modifican currentStock.
    for (const fc of finalCounts) {
      if (!bottleProductIds.has(fc.productId)) continue;
      const item = inventory.items.find((i) => i.productId === fc.productId);
      if (!item) continue;
      const level = isBottleLevel(fc.bottleLevel) ? fc.bottleLevel : null;
      const reserve = fc.reserveBottles ?? 0;
      await tx.dailyInventoryItem.update({
        where: { id: item.id },
        data: { bottleLevel: level, reserveBottles: reserve },
      });
      await tx.product.update({
        where: { id: fc.productId },
        data: {
          bottleLevel: level,
          reserveBottles: reserve,
          // Mantener currentStock sincronizado: reserva + 1 si hay botella abierta.
          currentStock: bottleStock(level, reserve),
        },
      });
    }

    await tx.dailyInventory.update({
      where: { id },
      data: { status: "closed", closedAt: new Date(), closedBy: userName },
    });
  });

  const closed = await prisma.dailyInventory.findUniqueOrThrow({
    where: { id },
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
      source: null,
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

  await audit({
    action: "daily.close", entityType: "DailyInventory", entityId: id,
    categoryId: meta.categoryId, categoryName, userId, userName,
    summary: `Cierre de inventario diario${categoryName ? ` de ${categoryName}` : ""} (${inventory.date}) con ${finalCounts.length} productos`,
  });

  return NextResponse.json({ inventory: { ...closed, items: itemsWithCalc } });
}
