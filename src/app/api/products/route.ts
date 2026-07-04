import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canCreateProducts, canAccessInventory } from "@/lib/permissions";
import { isBottleLevel } from "@/lib/bottle";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessInventory(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const activeOnly = searchParams.get("active") !== "false";
  const lowStock = searchParams.get("lowStock") === "true";

  const products = await prisma.product.findMany({
    where: {
      ...(activeOnly && { active: true }),
      ...(categoryId && { categoryId }),
    },
    include: { category: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const filtered = lowStock
    ? products.filter((p) => p.minStock > 0 && p.currentStock <= p.minStock)
    : products;

  return NextResponse.json({ products: filtered });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canCreateProducts(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json() as {
    name?: string;
    categoryId?: string;
    unit?: string;
    minStock?: number;
    imageUrl?: string;
    alertBottleLevel?: string | null;
  };

  if (!body.name?.trim() || !body.categoryId || !body.unit?.trim()) {
    return NextResponse.json({ error: "Nombre, categoría y unidad son requeridos" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      name: body.name.trim(),
      categoryId: body.categoryId,
      unit: body.unit.trim(),
      minStock: body.minStock ?? 0,
      imageUrl: body.imageUrl ?? null,
      alertBottleLevel: isBottleLevel(body.alertBottleLevel) ? body.alertBottleLevel : null,
    },
    include: { category: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ product }, { status: 201 });
}
