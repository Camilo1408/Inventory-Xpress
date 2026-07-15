import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewDailyCategory, canOpenDailyCategory } from "@/lib/permissions";
import { isBottleTrackedSlug, isBottleLevel, isShotsCopeoTrackedSlug } from "@/lib/bottle";
import { audit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

interface CreateItem {
  productId: string;
  initialCount: number;
  note?: string;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
  shotsCopeo?: boolean;
}

interface CreateBody {
  date?: unknown;
  categoryId?: unknown;
  items?: unknown;
}

/** Carga una categoría RAÍZ de inventario con su slug y los ids de productos que le pertenecen
 *  (productos de la propia raíz + productos de sus subcategorías). */
async function loadRootCategory(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, slug: true, parentId: true, children: { select: { id: true, slug: true } } },
  });
  if (!category || category.parentId) return null; // debe ser categoría raíz
  const slugByCat = new Map<string, string | null>([[category.id, category.slug]]);
  for (const c of category.children) slugByCat.set(c.id, c.slug);
  const catIds = [category.id, ...category.children.map((c) => c.id)];
  const products = await prisma.product.findMany({
    where: { categoryId: { in: catIds } },
    select: { id: true, active: true, categoryId: true },
  });
  const active = products.filter((p) => p.active);
  const productIds = new Set(active.map((p) => p.id));
  const slugByProduct = new Map<string, string | null>(
    active.map((p) => [p.id, p.categoryId ? slugByCat.get(p.categoryId) ?? null : null])
  );
  return { category, productIds, slugByProduct };
}

/** GET /api/daily-inventory?date=YYYY-MM-DD&categoryId=... */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!config.features.dailyInventory) {
    return NextResponse.json({ error: "Función no disponible" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const categoryId = searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json({ error: "categoryId es requerido" }, { status: 400 });

  const loaded = await loadRootCategory(categoryId);
  if (!loaded || !loaded.category.slug) {
    return NextResponse.json({ error: "Categoría de inventario no válida" }, { status: 404 });
  }
  if (!canViewDailyCategory(session.user, loaded.category.slug)) {
    return NextResponse.json({ error: "Sin permiso para esta categoría" }, { status: 403 });
  }

  const inventory = await prisma.dailyInventory.findUnique({
    where: { date_categoryId: { date, categoryId } },
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
      source: null,
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

/** POST /api/daily-inventory — abrir inventario del día para una categoría */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!config.features.dailyInventory) {
    return NextResponse.json({ error: "Función no disponible" }, { status: 403 });
  }

  const body = await req.json() as CreateBody;

  if (
    typeof body.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
    typeof body.categoryId !== "string" ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const date       = body.date;
  const categoryId = body.categoryId;
  const items      = body.items as CreateItem[];

  const loaded = await loadRootCategory(categoryId);
  if (!loaded || !loaded.category.slug) {
    return NextResponse.json({ error: "Categoría de inventario no válida" }, { status: 404 });
  }
  if (!canOpenDailyCategory(session.user, loaded.category.slug)) {
    await audit({
      action: "access.denied", entityType: "DailyInventory", categoryId, categoryName: loaded.category.name,
      userId: session.user.id, userName: session.user.name ?? session.user.username,
      summary: `Intento de abrir inventario de ${loaded.category.name} sin permiso`, result: "denied",
    });
    return NextResponse.json({ error: "Sin permiso para abrir esta categoría" }, { status: 403 });
  }

  const invalid = items.some((i) => {
    if (typeof i.productId !== "string") return true;
    if (i.shotsCopeo != null && typeof i.shotsCopeo !== "boolean") return true;
    const isBottle = isBottleTrackedSlug(loaded.slugByProduct.get(i.productId));
    if (isBottle) {
      if (i.bottleLevel != null && !isBottleLevel(i.bottleLevel)) return true;
      if (i.reserveBottles != null && (typeof i.reserveBottles !== "number" || i.reserveBottles < 0 || !Number.isInteger(i.reserveBottles))) return true;
      return false;
    }
    return typeof i.initialCount !== "number" || i.initialCount < 0;
  });
  if (invalid) {
    return NextResponse.json({ error: "Datos inválidos en items" }, { status: 400 });
  }

  // Todos los productos deben pertenecer a esta categoría raíz (no mezclar categorías).
  const allBelong = items.every((i) => loaded.productIds.has(i.productId));
  if (!allBelong) {
    return NextResponse.json({ error: "Hay productos que no pertenecen a esta categoría" }, { status: 400 });
  }

  const existing = await prisma.dailyInventory.findUnique({
    where: { date_categoryId: { date, categoryId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un inventario para esta fecha y categoría" }, { status: 409 });
  }

  const userId   = session.user.id;
  const userName = session.user.name ?? session.user.username;
  const noteByProduct = new Map(items.map((i) => [i.productId, i.note?.trim() ?? ""]));

  const inventory = await prisma.dailyInventory.create({
    data: {
      date,
      categoryId,
      userId,
      userName,
      items: {
        create: items.map((i) => {
          const slug = loaded.slugByProduct.get(i.productId);
          const isBottle = isBottleTrackedSlug(slug);
          return {
            productId: i.productId,
            initialCount: isBottle ? 0 : i.initialCount,
            bottleLevel: isBottle && isBottleLevel(i.bottleLevel) ? i.bottleLevel : null,
            reserveBottles: isBottle ? (i.reserveBottles ?? 0) : null,
            shotsCopeo: isShotsCopeoTrackedSlug(slug) ? !!i.shotsCopeo : false,
          };
        }),
      },
    },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
      },
    },
  });

  // Reconciliación de apertura: si el conteo inicial difiere del stock del sistema,
  // se ajusta el stock al valor contado dejando constancia en el historial global.
  await prisma.$transaction(async (tx) => {
    for (const item of inventory.items) {
      if (isBottleTrackedSlug(loaded.slugByProduct.get(item.productId))) continue; // ítems de botella no tocan stock
      const delta = item.initialCount - item.product.currentStock;
      if (delta === 0) continue;

      const userNote = noteByProduct.get(item.productId);
      const note =
        `Corrección de conteo inicial respecto al inventario anterior — inventario diario ${date}` +
        (userNote ? `. ${userNote}` : "");

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "ADJUSTMENT",
          quantity: delta,
          notes: note,
          userId,
          userName,
          dailyInventoryItemId: item.id,
          source: "daily_open_adjust",
        },
      });
      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: { increment: delta } },
      });
    }
  });

  await audit({
    action: "daily.open", entityType: "DailyInventory", entityId: inventory.id,
    categoryId, categoryName: loaded.category.name, userId, userName,
    summary: `Apertura de inventario diario de ${loaded.category.name} (${date}) con ${items.length} productos`,
  });

  const created = await prisma.dailyInventory.findUniqueOrThrow({
    where: { id: inventory.id },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true } } },
      },
    },
  });

  return NextResponse.json({ inventory: created }, { status: 201 });
}
