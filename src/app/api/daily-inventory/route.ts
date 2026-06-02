import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDoStockCount } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.object({
    productId: z.string().min(1),
    initialCount: z.number().min(0),
  })).min(1),
});

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

  // Calcular entradas y salidas del día para cada producto
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
    const prods = movements.filter((m) => m.productId === item.productId);
    const entries = prods.filter((m) => m.type === "ENTRY").reduce((s, m) => s + Math.abs(m.quantity), 0);
    const exits   = prods.filter((m) => m.type === "EXIT").reduce((s, m) => s + Math.abs(m.quantity), 0);
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

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { date, items } = parsed.data;

  // Verificar que no exista ya un inventario para esa fecha
  const existing = await prisma.dailyInventory.findUnique({ where: { date } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un inventario para esta fecha" }, { status: 409 });
  }

  // Verificar que todos los productos existan y estén activos
  const productIds = items.map((i) => i.productId);
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
      userId:   session.user.id ?? "",
      userName: session.user.name ?? session.user.username ?? "Usuario",
      items: {
        create: items.map((i) => ({ productId: i.productId, initialCount: i.initialCount })),
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
