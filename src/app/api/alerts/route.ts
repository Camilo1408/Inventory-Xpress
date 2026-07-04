import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessInventory } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessInventory(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");

  const products = await prisma.product.findMany({
    where: {
      active: true,
      minStock: { gt: 0 },
      ...(categoryId && { categoryId }),
    },
    include: { category: { select: { name: true } } },
  });

  const alerts = products
    .filter((p) => p.currentStock <= p.minStock)
    .map((p) => ({
      product: { id: p.id, name: p.name, unit: p.unit },
      currentStock: p.currentStock,
      minStock: p.minStock,
      deficit: p.minStock - p.currentStock,
      category: p.category,
    }));

  return NextResponse.json({ alerts, total: alerts.length });
}
