import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryName = searchParams.get("category");
  const period = searchParams.get("period") ?? "month";

  const now = new Date();
  let dateFrom: Date | undefined;
  if (period === "week") {
    dateFrom = new Date(now);
    dateFrom.setDate(now.getDate() - 7);
  } else if (period === "month") {
    dateFrom = new Date(now);
    dateFrom.setDate(1);
    dateFrom.setHours(0, 0, 0, 0);
  }

  const movements = await prisma.stockMovement.findMany({
    where: {
      type: "EXIT",
      ...(dateFrom && { createdAt: { gte: dateFrom } }),
      product: {
        active: true,
        ...(categoryName && { category: { name: categoryName } }),
      },
    },
    include: { product: { select: { id: true, name: true, unit: true } } },
  });

  // Agrupar por producto y sumar cantidades
  const totals = new Map<string, { productId: string; name: string; unit: string; total: number }>();
  for (const m of movements) {
    const existing = totals.get(m.productId);
    const qty = Math.abs(m.quantity);
    if (existing) {
      existing.total += qty;
    } else {
      totals.set(m.productId, {
        productId: m.productId,
        name: m.product.name,
        unit: m.product.unit,
        total: qty,
      });
    }
  }

  const results = Array.from(totals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  return NextResponse.json({ results, period, category: categoryName });
}
