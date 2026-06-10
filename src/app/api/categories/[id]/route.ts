import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageProducts } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageProducts(session.user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { name?: string; active?: boolean };

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });

  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageProducts(session.user.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;

  // Obtener subcategorías para desasignar sus productos también
  const category = await prisma.category.findUnique({
    where: { id },
    include: { children: { select: { id: true } } },
  });
  if (!category) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });

  const subIds = category.children.map((c) => c.id);

  await prisma.$transaction([
    // Desasignar productos de subcategorías (categoryId → null)
    ...(subIds.length > 0
      ? [prisma.product.updateMany({ where: { categoryId: { in: subIds } }, data: { categoryId: null } })]
      : []),
    // Desasignar productos de la categoría raíz (categoryId → null)
    prisma.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } }),
    // Eliminar subcategorías
    prisma.category.deleteMany({ where: { parentId: id } }),
    // Eliminar categoría
    prisma.category.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
