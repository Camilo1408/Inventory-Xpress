import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/permissions";
import { buildPermissionRegistry } from "@/lib/permission-registry";

/**
 * GET /api/inventory-permissions
 *
 * Registro completo de claves de permiso del módulo de inventario para que Nómina
 * Xpress las espeje y asigne a los roles. Incluye las claves globales y las claves
 * por cada categoría RAÍZ de inventario (derivadas de su slug).
 *
 * Pensado para que Nómina lo consulte (pull) y reconcilie permisos —especialmente
 * tras crear categorías nuevas— además del push best-effort al crearlas.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Solo roles administrativos pueden inspeccionar el registro de permisos.
  if (!isAdminRole(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const roots = await prisma.category.findMany({
    where: { parentId: null, active: true },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, name: true },
  });

  return NextResponse.json(buildPermissionRegistry(roots));
}
