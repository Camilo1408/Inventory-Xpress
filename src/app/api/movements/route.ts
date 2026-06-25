import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDoStockCount, canAdjustStock } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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
  };

  if (!body.productId || !body.type || body.quantity === undefined) {
    return NextResponse.json({ error: "productId, type y quantity son requeridos" }, { status: 400 });
  }

  if (!["ENTRY", "EXIT", "ADJUSTMENT"].includes(body.type)) {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }

  // Los ajustes manuales requieren permiso específico además de stock:count.
  if (body.type === "ADJUSTMENT" && !canAdjustStock(session.user)) {
    return NextResponse.json({ error: "Sin permiso para ajustes" }, { status: 403 });
  }

  const product = await prisma.product.findUnique({ where: { id: body.productId } });
  if (!product || !product.active) {
    return NextResponse.json({ error: "Producto no encontrado o inactivo" }, { status: 404 });
  }

  // Para EXIT, verificar stock suficiente
  if (body.type === "EXIT" && product.currentStock - body.quantity < 0) {
    return NextResponse.json({ error: "Stock insuficiente" }, { status: 400 });
  }

  const quantityDelta =
    body.type === "ENTRY" ? Math.abs(body.quantity) :
    body.type === "EXIT" ? -Math.abs(body.quantity) :
    body.quantity;

  const [movement, updatedProduct] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        productId: body.productId,
        type: body.type,
        quantity: quantityDelta,
        notes: body.notes ?? null,
        userId: session.user.id,
        userName: session.user.name ?? session.user.username,
      },
    }),
    prisma.product.update({
      where: { id: body.productId },
      data: { currentStock: { increment: quantityDelta } },
    }),
  ]);

  return NextResponse.json({ movement, product: updatedProduct }, { status: 201 });
}
