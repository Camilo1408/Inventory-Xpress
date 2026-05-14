import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const products = await prisma.product.findMany({
    where: { active: true, minStock: { gt: 0 } },
    include: { category: { select: { name: true } } },
  });

  const list = products
    .filter((p) => p.currentStock <= p.minStock)
    .map((p) => ({
      product: { id: p.id, name: p.name, unit: p.unit },
      currentStock: p.currentStock,
      minStock: p.minStock,
      deficit: p.minStock - p.currentStock,
      quantityToOrder: p.minStock * 2 - p.currentStock,
      category: p.category,
    }));

  return NextResponse.json({ list, total: list.length });
}
