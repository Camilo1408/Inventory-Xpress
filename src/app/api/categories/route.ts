import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageCategories, canAccessInventory, dailyCategoryKeys } from "@/lib/permissions";
import { uniqueSlug } from "@/lib/slug";
import { notifyNominaCategoryCreated } from "@/lib/permission-registry";
import { audit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessInventory(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Devuelve solo categorías raíz activas con sus subcategorías activas
  const categories = await prisma.category.findMany({
    where: { active: true, parentId: null },
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
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
  if (!canManageCategories(session.user)) {
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

  // Slug único y estable (base del contrato de permisos por categoría con Nómina).
  const existingSlugs = await prisma.category.findMany({
    where: { slug: { not: null } },
    select: { slug: true },
  });
  const used = new Set(existingSlugs.map((c) => c.slug as string));
  const slug = uniqueSlug(body.name.trim(), used);

  // sortOrder: al final dentro de su nivel (hermanos con el mismo parentId).
  const lastSibling = await prisma.category.findFirst({
    where: { parentId: body.parentId ?? null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (lastSibling?.sortOrder ?? 0) + 1;

  const category = await prisma.category.create({
    data: {
      name: body.name.trim(),
      parentId: body.parentId ?? null,
      slug,
      sortOrder,
    },
  });

  const userId = session.user.id;
  const userName = session.user.name ?? session.user.username;

  // Solo las categorías RAÍZ son categorías de inventario con permisos propios.
  if (!body.parentId) {
    await audit({
      action: "category.create", entityType: "Category", entityId: category.id,
      categoryId: category.id, categoryName: category.name, userId, userName,
      summary: `Categoría de inventario "${category.name}" creada (slug: ${slug})`,
    });
    // Registro de auto-creación de permisos. Las claves quedan disponibles para que
    // Nómina las espeje y asigne por defecto a PROPRIETARY/SUPERADMIN/ADMIN.
    const keys = dailyCategoryKeys(slug);
    await audit({
      action: "category.permissions.autocreate", entityType: "Category", entityId: category.id,
      categoryId: category.id, categoryName: category.name, userId, userName,
      summary: `Permisos auto-registrados para "${category.name}": ${keys.join(", ")}`,
    });
    // Notificación push best-effort a Nómina para que registre las claves y las
    // asigne a los roles por defecto. Si no hay URL configurada, Nómina reconcilia
    // vía GET /api/inventory-permissions. No bloquea la creación.
    await notifyNominaCategoryCreated({ slug, name: category.name, keys });
  }

  return NextResponse.json({ category }, { status: 201 });
}
