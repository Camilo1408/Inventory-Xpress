import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDoStockCount, canAdjustStock, canAccessInventory } from "@/lib/permissions";
import { isBottleTrackedSlug, isBottleLevel, bottleStock } from "@/lib/bottle";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessInventory(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const type = searchParams.get("type");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 20;

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(productId && { productId }),
      ...(type && { type }),
      ...((dateFrom || dateTo) ? {
        createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        },
      } : {}),
    },
    include: { product: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.stockMovement.count({
    where: {
      ...(productId && { productId }),
      ...(type && { type }),
    },
  });

  return NextResponse.json({ movements, total, page, limit });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canDoStockCount(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json() as {
    productId?: string;
    type?: string;
    quantity?: number;
    notes?: string;
    // Solo para BOTTLE_ADJUST (licores de cócteles)
    bottleLevel?: string | null;
    reserveBottles?: number;
  };

  if (!body.productId || !body.type) {
    return NextResponse.json({ error: "productId y type son requeridos" }, { status: 400 });
  }

  const VALID_TYPES = ["ENTRY", "EXIT", "ADJUSTMENT", "BOTTLE_ADJUST"];
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: body.productId },
    include: { category: { select: { slug: true } } },
  });
  if (!product || !product.active) {
    return NextResponse.json({ error: "Producto no encontrado o inactivo" }, { status: 404 });
  }

  const userId   = session.user.id;
  const userName = session.user.name ?? session.user.username;
  const isBotella = isBottleTrackedSlug(product.category?.slug);

  // ── Productos de botella (Cócteles) ──────────────────────────────────────────
  if (isBotella) {
    // BOTTLE_ADJUST: cambia nivel de botella y/o reserva, recalcula currentStock.
    if (body.type === "BOTTLE_ADJUST") {
      if (!canAdjustStock(session.user)) {
        return NextResponse.json({ error: "Sin permiso para ajustes" }, { status: 403 });
      }

      const newLevel   = isBottleLevel(body.bottleLevel) ? body.bottleLevel : null;
      const newReserve = typeof body.reserveBottles === "number"
        ? Math.max(0, Math.floor(body.reserveBottles))
        : (product.reserveBottles ?? 0);

      const oldStock  = bottleStock(product.bottleLevel, product.reserveBottles);
      const newStock  = bottleStock(newLevel, newReserve);
      const delta     = newStock - oldStock;

      const oldLevelLabel = product.bottleLevel ?? "sin botella";
      const newLevelLabel = newLevel ?? "sin botella";
      const autoNote = `Ajuste nivel: ${oldLevelLabel} → ${newLevelLabel} | reserva: ${product.reserveBottles ?? 0} → ${newReserve}`;

      const [movement, updated] = await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: "ADJUSTMENT",
            quantity: delta,
            source: "bottle_adjust",
            notes: body.notes?.trim() || autoNote,
            userId,
            userName,
          },
        }),
        prisma.product.update({
          where: { id: product.id },
          data: { bottleLevel: newLevel, reserveBottles: newReserve, currentStock: newStock },
        }),
      ]);
      return NextResponse.json({ movement, product: updated }, { status: 201 });
    }

    // ENTRY: añade botellas a la reserva.
    if (body.type === "ENTRY") {
      if (body.quantity === undefined || body.quantity <= 0) {
        return NextResponse.json({ error: "Cantidad debe ser mayor a 0" }, { status: 400 });
      }
      const qty        = Math.ceil(Math.abs(body.quantity)); // entero positivo
      const newReserve = (product.reserveBottles ?? 0) + qty;
      const newStock   = bottleStock(product.bottleLevel, newReserve);

      const [movement, updated] = await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: "ENTRY",
            quantity: qty,
            notes: body.notes ?? null,
            userId,
            userName,
          },
        }),
        prisma.product.update({
          where: { id: product.id },
          data: { reserveBottles: newReserve, currentStock: newStock },
        }),
      ]);
      return NextResponse.json({ movement, product: updated }, { status: 201 });
    }

    // EXIT: retira botellas de la reserva.
    if (body.type === "EXIT") {
      if (body.quantity === undefined || body.quantity <= 0) {
        return NextResponse.json({ error: "Cantidad debe ser mayor a 0" }, { status: 400 });
      }
      const qty            = Math.ceil(Math.abs(body.quantity));
      const currentReserve = product.reserveBottles ?? 0;
      if (currentReserve < qty) {
        return NextResponse.json(
          { error: `Reserva insuficiente (${currentReserve} disponibles en reserva)` },
          { status: 400 }
        );
      }
      const newReserve = currentReserve - qty;
      const newStock   = bottleStock(product.bottleLevel, newReserve);

      const [movement, updated] = await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: "EXIT",
            quantity: -qty,
            notes: body.notes ?? null,
            userId,
            userName,
          },
        }),
        prisma.product.update({
          where: { id: product.id },
          data: { reserveBottles: newReserve, currentStock: newStock },
        }),
      ]);
      return NextResponse.json({ movement, product: updated }, { status: 201 });
    }

    // ADJUSTMENT numérico no aplica a productos de botella.
    return NextResponse.json(
      { error: "Para licores de cócteles usa 'Ajuste Nivel' para cambiar el estado de la botella." },
      { status: 400 }
    );
  }

  // ── Productos numéricos normales ──────────────────────────────────────────────
  if (body.type === "BOTTLE_ADJUST") {
    return NextResponse.json({ error: "BOTTLE_ADJUST solo aplica a licores de cócteles" }, { status: 400 });
  }

  if (body.quantity === undefined) {
    return NextResponse.json({ error: "quantity es requerido" }, { status: 400 });
  }

  if (!["ENTRY", "EXIT", "ADJUSTMENT"].includes(body.type)) {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }

  if (body.type === "ADJUSTMENT" && !canAdjustStock(session.user)) {
    return NextResponse.json({ error: "Sin permiso para ajustes" }, { status: 403 });
  }

  if (body.type === "EXIT" && product.currentStock - body.quantity < 0) {
    return NextResponse.json({ error: "Stock insuficiente" }, { status: 400 });
  }

  const quantityDelta =
    body.type === "ENTRY"      ?  Math.abs(body.quantity) :
    body.type === "EXIT"       ? -Math.abs(body.quantity) :
    body.quantity;

  const [movement, updatedProduct] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        productId: body.productId,
        type: body.type,
        quantity: quantityDelta,
        notes: body.notes ?? null,
        userId,
        userName,
      },
    }),
    prisma.product.update({
      where: { id: body.productId },
      data: { currentStock: { increment: quantityDelta } },
    }),
  ]);

  return NextResponse.json({ movement, product: updatedProduct }, { status: 201 });
}
