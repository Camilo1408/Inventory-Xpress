import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewReports } from "@/lib/permissions";

type Period = "week" | "fortnight" | "month" | "all";

function getPeriodDateFrom(period: Period): Date | null {
  const now = new Date();

  if (period === "week") {
    // Lunes de la semana actual a las 00:00:00
    const day = now.getDay(); // 0=Dom, 1=Lun ... 6=Sáb
    const daysFromMonday = day === 0 ? 6 : day - 1;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday);
  }

  if (period === "fortnight") {
    const d = now.getDate();
    // Primera quincena: 1–15 → inicia día 1
    // Segunda quincena: 16–fin → inicia día 16
    const startDay = d <= 15 ? 1 : 16;
    return new Date(now.getFullYear(), now.getMonth(), startDay);
  }

  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return null; // "all" — sin límite de fecha
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canViewReports(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") ?? "month") as Period;

  const dateFrom = getPeriodDateFrom(period);

  // Todos los productos con categoría y categoría padre
  const products = await prisma.product.findMany({
    include: {
      category: {
        include: { parent: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  // Movimientos del período (todos los productos)
  const movements = await prisma.stockMovement.findMany({
    where: dateFrom ? { createdAt: { gte: dateFrom } } : {},
    select: { productId: true, type: true, quantity: true },
  });

  // Acumular por producto:
  // - entries: suma de cantidades positivas (ENTRY y ajustes positivos)
  // - exits: suma de cantidades absolutas negativas (EXIT y ajustes negativos)
  // - netDelta: suma algebraica de todos los deltas (como se almacena en DB)
  const byProduct = new Map<string, { entries: number; exits: number; netDelta: number }>();

  for (const mv of movements) {
    const agg = byProduct.get(mv.productId) ?? { entries: 0, exits: 0, netDelta: 0 };
    agg.netDelta += mv.quantity;

    if (mv.type === "ENTRY") {
      agg.entries += mv.quantity; // siempre positivo
    } else if (mv.type === "EXIT") {
      agg.exits += Math.abs(mv.quantity); // en DB es negativo, mostramos positivo
    } else if (mv.type === "ADJUSTMENT") {
      if (mv.quantity > 0) agg.entries += mv.quantity;
      else agg.exits += Math.abs(mv.quantity);
    }

    byProduct.set(mv.productId, agg);
  }

  // Construir filas del reporte
  // stock_inicial = currentStock - netDelta
  // (ya que currentStock = stock_inicial + netDelta_del_período)
  const rows = products.map((p) => {
    const agg = byProduct.get(p.id) ?? { entries: 0, exits: 0, netDelta: 0 };
    const stockInitial = p.currentStock - agg.netDelta;

    let category = "";
    let subcategory = "";
    if (p.category) {
      if (p.category.parent) {
        category = p.category.parent.name;
        subcategory = p.category.name;
      } else {
        category = p.category.name;
      }
    }

    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      category,
      subcategory,
      stockInitial,
      entries: agg.entries,
      exits: agg.exits,
      currentStock: p.currentStock,
      active: p.active,
    };
  });

  return NextResponse.json({ rows, period });
}
