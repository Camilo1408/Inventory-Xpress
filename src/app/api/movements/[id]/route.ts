import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditMovements } from "@/lib/permissions";
import { isBottleTrackedSlug, bottleStock } from "@/lib/bottle";
import { toBusinessDate } from "@/lib/dates";
import { audit } from "@/lib/audit";

/** Corrección de movimientos manuales (source = null): editar cantidad/notas o
 *  eliminar. Los auto-generados (cierres de jornada, ajustes de nivel, aperturas)
 *  se corrigen desde sus flujos propios, nunca desde aquí.
 *
 *  Regla de jornadas: si la jornada del día del movimiento (categoría raíz del
 *  producto) está CERRADA, el movimiento queda bloqueado — hay que reabrirla
 *  primero para que el cierre siga siendo una foto consistente. */

const MANUAL_TYPES = ["ENTRY", "EXIT", "ADJUSTMENT"];

interface LoadedMovement {
  movement: {
    id: string;
    productId: string;
    type: string;
    quantity: number;
    notes: string | null;
    createdAt: Date;
  };
  product: {
    id: string;
    name: string;
    unit: string;
    currentStock: number;
    bottleLevel: string | null;
    reserveBottles: number | null;
  };
  isBottle: boolean;
}

/** Carga y valida el movimiento; devuelve un Response de error si no procede. */
async function loadEditableMovement(id: string): Promise<LoadedMovement | NextResponse> {
  const movement = await prisma.stockMovement.findUnique({
    where: { id },
    select: {
      id: true, productId: true, type: true, quantity: true, notes: true,
      source: true, createdAt: true,
      product: {
        select: {
          id: true, name: true, unit: true, currentStock: true,
          bottleLevel: true, reserveBottles: true,
          category: { select: { id: true, parentId: true, slug: true } },
        },
      },
    },
  });
  if (!movement) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });

  if (movement.source !== null || !MANUAL_TYPES.includes(movement.type)) {
    return NextResponse.json(
      { error: "Solo se pueden corregir movimientos manuales. Los generados por el inventario diario o el ajuste de nivel se corrigen desde su propio flujo." },
      { status: 400 }
    );
  }

  const isBottle = isBottleTrackedSlug(movement.product.category?.slug);
  // ADJUSTMENT manual sobre producto de botella no existe en el flujo actual;
  // si apareciera uno legado, corregirlo tocaría nivel/reserva sin criterio claro.
  if (isBottle && movement.type === "ADJUSTMENT") {
    return NextResponse.json(
      { error: "Los ajustes de licores de cócteles se corrigen con 'Ajuste Nivel'." },
      { status: 400 }
    );
  }

  // Jornada cerrada del día del movimiento → bloqueado (reabrir primero).
  const cat = movement.product.category;
  const rootCategoryId = cat ? (cat.parentId ?? cat.id) : null;
  if (rootCategoryId) {
    const jornada = await prisma.dailyInventory.findUnique({
      where: { date_categoryId: { date: toBusinessDate(movement.createdAt), categoryId: rootCategoryId } },
      select: { status: true },
    });
    if (jornada?.status === "closed") {
      return NextResponse.json(
        { error: "La jornada de ese día está cerrada. Reábrela desde Inventario Diario para poder corregir el movimiento." },
        { status: 409 }
      );
    }
  }

  return {
    movement: {
      id: movement.id, productId: movement.productId, type: movement.type,
      quantity: movement.quantity, notes: movement.notes, createdAt: movement.createdAt,
    },
    product: {
      id: movement.product.id, name: movement.product.name, unit: movement.product.unit,
      currentStock: movement.product.currentStock,
      bottleLevel: movement.product.bottleLevel, reserveBottles: movement.product.reserveBottles,
    },
    isBottle,
  };
}

/** Aplica un delta de cantidad al producto validando que nada quede negativo.
 *  Devuelve los datos del update o un mensaje de error. */
function productUpdateForDelta(
  loaded: LoadedMovement,
  delta: number
): { data: Record<string, unknown> } | { error: string } {
  const { product, isBottle } = loaded;
  if (isBottle) {
    // ENTRY/EXIT de botella mueven solo la RESERVA; el nivel de la botella
    // abierta nunca se toca desde una corrección (para eso está Ajuste Nivel).
    const newReserve = (product.reserveBottles ?? 0) + delta;
    if (newReserve < 0) {
      return { error: `La corrección dejaría la reserva en ${newReserve}. Ajusta primero el estado de la botella.` };
    }
    return { data: { reserveBottles: newReserve, currentStock: bottleStock(product.bottleLevel, newReserve) } };
  }
  const newStock = product.currentStock + delta;
  if (newStock < 0) {
    return { error: `La corrección dejaría el stock en ${newStock}. Verifica la cantidad.` };
  }
  return { data: { currentStock: { increment: delta } } };
}

/** PATCH /api/movements/[id] — body { quantity?, notes? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canEditMovements(session.user)) {
    return NextResponse.json({ error: "Sin permiso para corregir movimientos" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { quantity?: unknown; notes?: unknown };

  const hasQuantity = body.quantity !== undefined;
  const hasNotes = body.notes !== undefined;
  if (!hasQuantity && !hasNotes) {
    return NextResponse.json({ error: "Nada que corregir: envía quantity y/o notes" }, { status: 400 });
  }
  if (hasQuantity && (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity === 0)) {
    return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
  }
  if (hasNotes && body.notes !== null && typeof body.notes !== "string") {
    return NextResponse.json({ error: "Notas inválidas" }, { status: 400 });
  }

  const loaded = await loadEditableMovement(id);
  if (loaded instanceof NextResponse) return loaded;
  const { movement, product, isBottle } = loaded;

  // Normalizar el signo por tipo, como en la creación: ENTRY positivo, EXIT
  // negativo, ADJUSTMENT con el signo que traiga. Botellas: enteros.
  let newQuantity = movement.quantity;
  if (hasQuantity) {
    const q = body.quantity as number;
    const magnitude = isBottle ? Math.ceil(Math.abs(q)) : Math.abs(q);
    newQuantity =
      movement.type === "ENTRY" ? magnitude :
      movement.type === "EXIT"  ? -magnitude :
      q;
  }
  const newNotes = hasNotes
    ? ((body.notes as string | null)?.trim() || null)
    : movement.notes;

  const delta = newQuantity - movement.quantity;
  const upd = productUpdateForDelta(loaded, delta);
  if ("error" in upd) return NextResponse.json({ error: upd.error }, { status: 400 });

  const [updatedMovement] = await prisma.$transaction([
    prisma.stockMovement.update({
      where: { id: movement.id },
      data: { quantity: newQuantity, notes: newNotes },
    }),
    ...(delta !== 0
      ? [prisma.product.update({ where: { id: product.id }, data: upd.data })]
      : []),
  ]);

  await audit({
    action: "movement.edit", entityType: "StockMovement", entityId: movement.id,
    userId: session.user.id, userName: session.user.name ?? session.user.username,
    summary: `Corrección de movimiento ${movement.type} de ${product.name}: cantidad ${movement.quantity} → ${newQuantity}`,
  });

  return NextResponse.json({ movement: updatedMovement });
}

/** DELETE /api/movements/[id] — revierte el efecto en stock y elimina el registro. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canEditMovements(session.user)) {
    return NextResponse.json({ error: "Sin permiso para corregir movimientos" }, { status: 403 });
  }

  const { id } = await params;
  const loaded = await loadEditableMovement(id);
  if (loaded instanceof NextResponse) return loaded;
  const { movement, product } = loaded;

  const delta = -movement.quantity; // revertir el efecto original
  const upd = productUpdateForDelta(loaded, delta);
  if ("error" in upd) return NextResponse.json({ error: upd.error }, { status: 400 });

  await prisma.$transaction([
    prisma.stockMovement.delete({ where: { id: movement.id } }),
    ...(delta !== 0
      ? [prisma.product.update({ where: { id: product.id }, data: upd.data })]
      : []),
  ]);

  await audit({
    action: "movement.delete", entityType: "StockMovement", entityId: movement.id,
    userId: session.user.id, userName: session.user.name ?? session.user.username,
    summary: `Eliminación de movimiento ${movement.type} de ${product.name} (cantidad ${movement.quantity})`,
  });

  return NextResponse.json({ ok: true });
}
