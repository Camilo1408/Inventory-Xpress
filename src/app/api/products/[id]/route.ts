import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditProducts, canDeleteProducts, canHardDeleteProducts } from "@/lib/permissions";
import { isBottleLevel } from "@/lib/bottle";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });

  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canEditProducts(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as {
    name?: string;
    categoryId?: string;
    unit?: string;
    minStock?: number;
    imageUrl?: string;
    active?: boolean;
    alertBottleLevel?: string | null;
  };

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      ...(body.unit !== undefined && { unit: body.unit.trim() }),
      ...(body.minStock !== undefined && { minStock: body.minStock }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.alertBottleLevel !== undefined && { alertBottleLevel: isBottleLevel(body.alertBottleLevel) ? body.alertBottleLevel : null }),
    },
    include: { category: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ product });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const mode = new URL(req.url).searchParams.get("mode");

  // ── Borrado PERMANENTE seguro (solo SUPERADMIN/PROPRIETARY, sin historial) ──
  if (mode === "hard") {
    if (!canHardDeleteProducts(session.user)) {
      return NextResponse.json({ error: "Sin permiso para borrado permanente" }, { status: 403 });
    }
    const [movements, dailyItems] = await Promise.all([
      prisma.stockMovement.count({ where: { productId: id } }),
      prisma.dailyInventoryItem.count({ where: { productId: id } }),
    ]);
    if (movements > 0 || dailyItems > 0) {
      return NextResponse.json(
        {
          error: "El producto tiene historial y no puede borrarse permanentemente. Desactívalo para conservar la trazabilidad.",
          code: "HAS_HISTORY",
          movements,
          dailyItems,
        },
        { status: 409 }
      );
    }
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  // ── Borrado lógico por defecto: desactivar para preservar historial ──
  if (!canDeleteProducts(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  await prisma.product.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
