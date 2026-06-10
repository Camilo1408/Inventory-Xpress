import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageProducts } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Devuelve solo categorías raíz activas con sus subcategorías activas
  const categories = await prisma.category.findMany({
    where: { active: true, parentId: null },
    orderBy: { name: "asc" },
    include: {
      children: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      },
      _count: { select: { products: true } },
    },
  });

  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageProducts(session.user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json() as { name?: string; parentId?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  // Si tiene parentId, verificar que el padre existe y es raíz (sin parentId)
  if (body.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: body.parentId } });
    if (!parent) return NextResponse.json({ error: "Categoría padre no encontrada" }, { status: 404 });
    if (parent.parentId) return NextResponse.json({ error: "Solo se permite un nivel de subcategorías" }, { status: 400 });
  }

  // Validar nombre único dentro del mismo nivel
  const duplicate = await prisma.category.findFirst({
    where: {
      name: { equals: body.name.trim() },
      parentId: body.parentId ?? null,
      active: true,
    },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre en este nivel" }, { status: 409 });
  }

  const category = await prisma.category.create({
    data: {
      name: body.name.trim(),
      parentId: body.parentId ?? null,
    },
  });

  return NextResponse.json({ category }, { status: 201 });
}
