import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDailyCategory, canDoStockCount, canReopenDailyInventory, type DailyAction } from "@/lib/permissions";
import { isBottleTrackedSlug, isBottleLevel, isShotsCopeoTrackedSlug, bottleStock } from "@/lib/bottle";
import { audit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { businessDayRange } from "@/lib/dates";

interface FinalCountItem {
  productId: string;
  finalCount: number;
  unregisteredEntry?: number | null;
  unregisteredExit?: number | null;
  entryReason?: string | null; // motivo de la entrada no registrada
  entryTime?: string | null;   // hora de ingreso "HH:MM"
  bottleLevel?: string | null;
  reserveBottles?: number | null;
  shotsCopeo?: boolean;
}

interface PatchBody {
  action?: string;
  reason?: string;
  finalCounts?: unknown;
  initialCounts?: unknown;
}

/** PATCH /api/daily-inventory/[id]
 *  body { finalCounts: [...] }                        → cerrar inventario (permiso :close de la categoría)
 *  body { action: "reopen" }                          → reabrir inventario (permiso :edit de la categoría)
 *  body { action: "editInitial", initialCounts: [...] } → corregir conteo inicial de una jornada ABIERTA
 *                                                         (permiso :edit de la categoría, igual que reabrir)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!config.features.dailyInventory) {
    return NextResponse.json({ error: "Función no disponible" }, { status: 403 });
  }

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

  // ── Acción: corregir conteo inicial (jornada ABIERTA) ───────────────────────
  if (body.action === "editInitial") {
    if (!allowed("edit")) {
      await audit({
        action: "access.denied", entityType: "DailyInventory", entityId: id,
        categoryId: meta.categoryId, categoryName, userId, userName,
        summary: `Intento de editar conteo inicial${categoryName ? ` de ${categoryName}` : ""} sin permiso`, result: "denied",
      });
      return NextResponse.json({ error: "Sin permiso para editar el conteo inicial" }, { status: 403 });
    }

    const inventory = await prisma.dailyInventory.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { id: true, category: { select: { slug: true } } } } } } },
    });
    if (!inventory) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });
    if (inventory.status !== "open") {
      return NextResponse.json({ error: "Solo se puede editar el conteo inicial de una jornada abierta" }, { status: 409 });
    }

    if (!Array.isArray(body.initialCounts) || body.initialCounts.length === 0) {
      return NextResponse.json({ error: "initialCounts es requerido y debe tener al menos un elemento" }, { status: 400 });
    }
    const initialCounts = body.initialCounts as { productId: string; initialCount: number }[];

    const invalid = initialCounts.some(
      (ic) => typeof ic.productId !== "string" || typeof ic.initialCount !== "number" || ic.initialCount < 0
    );
    if (invalid) return NextResponse.json({ error: "Datos inválidos en initialCounts" }, { status: 400 });

    // Categoría raíz de la jornada + subcategorías: define qué productos "pertenecen"
    // a esta jornada (para validar los productos NUEVOS agregados durante el día).
    let catIds: string[] = [];
    if (inventory.categoryId) {
      const kids = await prisma.category.findMany({ where: { parentId: inventory.categoryId }, select: { id: true } });
      catIds = [inventory.categoryId, ...kids.map((k) => k.id)];
    }

    // Productos candidatos del payload: solo activos, de esta categoría. Un producto
    // creado DESPUÉS de abrir la jornada llega aquí sin ítem previo → se le crea uno.
    const candidateProducts = catIds.length
      ? await prisma.product.findMany({
          where: { id: { in: initialCounts.map((ic) => ic.productId) }, active: true, categoryId: { in: catIds } },
          select: { id: true, currentStock: true, category: { select: { slug: true } } },
        })
      : [];
    const productById = new Map(candidateProducts.map((p) => [p.id, p]));
    const itemByProduct = new Map(inventory.items.map((i) => [i.productId, i]));

    // Ajustes de apertura existentes (para editar en vez de duplicar).
    const existingAdjust = await prisma.stockMovement.findMany({
      where: { dailyInventoryItemId: { in: inventory.items.map((i) => i.id) }, source: "daily_open_adjust" },
      select: { id: true, dailyInventoryItemId: true, quantity: true },
    });
    const adjustByItem = new Map(existingAdjust.map((m) => [m.dailyInventoryItemId!, m]));

    const note = `Corrección de conteo inicial (jornada abierta) por ${userName} — inventario diario ${inventory.date}`;

    await prisma.$transaction(async (tx) => {
      for (const ic of initialCounts) {
        const prod = productById.get(ic.productId);
        // Ignora productos que no son de esta categoría, están inactivos, o son de
        // botella (esos no llevan conteo numérico inicial).
        if (!prod || isBottleTrackedSlug(prod.category?.slug)) continue;

        const item = itemByProduct.get(ic.productId);

        if (item) {
          // ── Producto YA en la jornada: corrige su conteo inicial ──────────────
          if (ic.initialCount === item.initialCount) continue;
          // delta respecto al conteo inicial PREVIO: preserva movimientos manuales
          // que ya hayan ocurrido hoy después de abrir la jornada.
          const delta = ic.initialCount - item.initialCount;
          const existing = adjustByItem.get(item.id);
          const newAdjustQty = (existing?.quantity ?? 0) + delta;

          await tx.dailyInventoryItem.update({ where: { id: item.id }, data: { initialCount: ic.initialCount } });
          if (existing) {
            await tx.stockMovement.update({ where: { id: existing.id }, data: { quantity: newAdjustQty, notes: note } });
          } else if (newAdjustQty !== 0) {
            await tx.stockMovement.create({
              data: {
                productId: ic.productId, type: "ADJUSTMENT", quantity: newAdjustQty, notes: note,
                userId, userName, dailyInventoryItemId: item.id, source: "daily_open_adjust",
              },
            });
          }
          await tx.product.update({ where: { id: ic.productId }, data: { currentStock: { increment: delta } } });
        } else {
          // ── Producto NUEVO (creado durante la jornada): se suma al conteo ──────
          // Reconcilia el stock igual que la apertura: delta = conteo − stock actual.
          const created = await tx.dailyInventoryItem.create({
            data: { dailyInventoryId: id, productId: ic.productId, initialCount: ic.initialCount },
          });
          const delta = ic.initialCount - prod.currentStock;
          if (delta !== 0) {
            await tx.stockMovement.create({
              data: {
                productId: ic.productId, type: "ADJUSTMENT", quantity: delta, notes: note,
                userId, userName, dailyInventoryItemId: created.id, source: "daily_open_adjust",
              },
            });
            await tx.product.update({ where: { id: ic.productId }, data: { currentStock: { increment: delta } } });
          }
        }
      }
    });

    await audit({
      action: "daily.edit_initial", entityType: "DailyInventory", entityId: id,
      categoryId: meta.categoryId, categoryName, userId, userName,
      summary: `Corrección de conteo inicial${categoryName ? ` de ${categoryName}` : ""} (${inventory.date})`,
    });

    const updated = await prisma.dailyInventory.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } } } },
    });
    return NextResponse.json({ inventory: updated });
  }

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
  // Licores/Vinos: únicas subcategorías donde aplica el indicador shots/copeo.
  const shotsCopeoEligibleIds = new Set(
    invProducts.filter((p) => isShotsCopeoTrackedSlug(p.category?.slug)).map((p) => p.id)
  );

  const invalid = finalCounts.some((fc) => {
    if (typeof fc.productId !== "string") return true;
    if (fc.shotsCopeo != null && typeof fc.shotsCopeo !== "boolean") return true;
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
  const { start: dayStart0, end: dayEnd0 } = businessDayRange(inventory.date);
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

      const shotsCopeoEligible = shotsCopeoEligibleIds.has(fc.productId);
      const shotsCopeo = shotsCopeoEligible ? !!fc.shotsCopeo : false;

      return { item, finalCount: fc.finalCount, e, x, entryReason, entryTime, shotsCopeo, shotsCopeoEligible };
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
      const { item, finalCount, e, x, entryReason, entryTime, shotsCopeo, shotsCopeoEligible } = c;

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
          ...(shotsCopeoEligible ? { shotsCopeo } : {}),
        },
      });
      // Write-through a Product: solo para Licores/Vinos (única subcategoría elegible).
      if (shotsCopeoEligible) {
        await tx.product.update({ where: { id: item.productId }, data: { shotsCopeo } });
      }

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

  const { start: dayStart, end: dayEnd } = businessDayRange(inventory.date);

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

/** DELETE /api/daily-inventory/[id]
 *  Descarta una jornada ABIERTA (permiso :edit de la categoría, igual que reabrir).
 *  No aplica a jornadas cerradas: esas ya generaron movimientos de cierre y stock
 *  consolidado; para corregirlas se usa "reopen".
 *
 *  Revierte cualquier ajuste de stock hecho al abrir ("daily_open_adjust") antes
 *  de borrar, y borra el registro (los DailyInventoryItem caen en cascada).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!config.features.dailyInventory) {
    return NextResponse.json({ error: "Función no disponible" }, { status: 403 });
  }

  const { id } = await params;

  const inventory = await prisma.dailyInventory.findUnique({
    where: { id },
    include: { items: { select: { id: true, productId: true } } },
  });
  if (!inventory) return NextResponse.json({ error: "Inventario no encontrado" }, { status: 404 });

  // Gate por categoría: descartar exige el permiso `:edit` (mismo que "Reabrir/editar").
  // Registros legados (categoryId NULL) caen al gate global de reabrir.
  let categorySlug: string | null = null;
  let categoryName: string | null = null;
  if (inventory.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: inventory.categoryId }, select: { slug: true, name: true } });
    categorySlug = cat?.slug ?? null;
    categoryName = cat?.name ?? null;
  }
  const canDiscard = categorySlug
    ? canDailyCategory(session.user, categorySlug, "edit")
    : canReopenDailyInventory(session.user);
  if (!canDiscard) {
    return NextResponse.json({ error: "Sin permiso para descartar esta jornada" }, { status: 403 });
  }

  let reason = "";
  try {
    const body = await req.json() as { reason?: string };
    reason = body.reason?.trim() ?? "";
  } catch {
    // body ausente/no-JSON: se trata como reason vacío, validado abajo
  }
  if (!reason) {
    return NextResponse.json({ error: "Debes ingresar una justificación para descartar la jornada" }, { status: 400 });
  }

  if (inventory.status !== "open") {
    return NextResponse.json({ error: "Solo se pueden descartar jornadas abiertas" }, { status: 409 });
  }

  const userId   = session.user.id;
  const userName = session.user.name ?? session.user.username;

  const itemIds = inventory.items.map((i) => i.id);
  const adjustments = await prisma.stockMovement.findMany({
    where: { dailyInventoryItemId: { in: itemIds }, source: "daily_open_adjust" },
    select: { productId: true, quantity: true },
  });

  await prisma.$transaction(async (tx) => {
    // Revertir el ajuste de stock hecho al abrir, si lo hubo.
    for (const adj of adjustments) {
      if (adj.quantity === 0) continue;
      await tx.product.update({
        where: { id: adj.productId },
        data: { currentStock: { decrement: adj.quantity } },
      });
    }
    // dailyInventoryItemId no tiene FK en cascada en StockMovement: limpiar
    // explícitamente los movimientos de apertura antes de borrar la jornada.
    await tx.stockMovement.deleteMany({ where: { dailyInventoryItemId: { in: itemIds }, source: "daily_open_adjust" } });
    await tx.dailyInventory.delete({ where: { id } }); // items en cascada
  });

  await audit({
    action: "daily.delete", entityType: "DailyInventory", entityId: id,
    categoryId: inventory.categoryId, categoryName, userId, userName,
    summary: `Jornada abierta descartada${categoryName ? ` de ${categoryName}` : ""} (${inventory.date}). Motivo: ${reason}`,
  });

  return NextResponse.json({ ok: true });
}
