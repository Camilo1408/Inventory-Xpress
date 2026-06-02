import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDoStockCount } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

interface CreateItem {
  productId: string;
  initialCount: number;
}

interface CreateBody {
  date?: unknown;
  items?: unknown;
}

/** GET /api/daily-inventory?date=YYYY-MM-DD  (omitir = hoy) */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !canDoStockCount(session.user.role, session.user.inventoryAccess)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const inventory = await prisma.dailyInventory.findUnique({
    where: { date },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
        orderBy: { product: { name: "asc" } },
      },
    },
  });

  if (!inventory) return NextResponse.json({ inventory: null });

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd   = new Date(`${date}T23:59:59.999Z`);

  const movements = await prisma.stockMovement.findMany({
    where: {
      productId: { in: inventory.items.map((i) => i.productId) },
      type: { in: ["ENTRY", "EXIT"] },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    select: { productId: true, type: true, quantity: true },
  });

  const itemsWithCalc = inventory.items.map((item) => {
    const prods    = movements.filter((m) => m.productId === item.productId);
    const entries  = prods.filter((m) => m.type === "ENTRY").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const exits    = prods.filter((m) => m.type === "EXIT").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const expected = item.initialCount + entries - exits;
    const discrepancy = item.finalCount !== null ? item.finalCount - expected : null;
    return { ...item, entries, exits, expected, discrepancy };
  });

  return NextResponse.json({ inventory: { ...inventory, items: itemsWithCalc } });
}

/** POST /api/daily-inventory — crear inventario del día con conteos iniciales */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !canDoStockCount(session.user.role, session.user.inventoryAccess)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json() as CreateBody;

  if (
    typeof body.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const date  = body.date;
  const items = body.items as CreateItem[];

  const invalid = items.some(
    (i: CreateItem) => typeof i.productId !== "string" || typeof i.initialCount !== "number" || i.initialCount < 0
  );
  if (invalid) {
    return NextResponse.json({ error: "Datos inválidos en items" }, { status: 400 });
  }

  const existing = await prisma.dailyInventory.findUnique({ where: { date } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un inventario para esta fecha" }, { status: 409 });
  }

  const productIds = items.map((i: CreateItem) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    select: { id: true },
  });
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "Uno o más productos no existen o están inactivos" }, { status: 400 });
  }

  const inventory = await prisma.dailyInventory.create({
    data: {
      date,
      userId:   session.user.id,
      userName: session.user.name ?? session.user.username,
      items: {
        create: items.map((i: CreateItem) => ({ productId: i.productId, initialCount: i.initialCount })),
      },
    },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
      },
    },
  });

  return NextResponse.json({ inventory }, { status: 201 });
}
