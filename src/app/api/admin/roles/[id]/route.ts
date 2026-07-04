import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageUsers } from "@/lib/permissions";
import { sanitizePermissionKeys } from "@/lib/roles";

function isStandalone() {
  return process.env.AUTH_MODE === "standalone";
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.role.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });

  const body = await req.json() as {
    name?: string;
    description?: string;
    permissions?: unknown;
    active?: boolean;
  };

  const role = await prisma.role.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() || null }),
      ...(body.permissions !== undefined && { permissions: JSON.stringify(sanitizePermissionKeys(body.permissions)) }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });

  return NextResponse.json({ role });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.role.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });

  // Si tiene usuarios asignados, no se puede borrar: primero hay que reasignarlos.
  const userCount = await prisma.user.count({ where: { customRoleId: id } });
  if (userCount > 0) {
    return NextResponse.json(
      { error: `El rol está asignado a ${userCount} usuario(s). Reasígnalos antes de eliminar.`, code: "HAS_USERS" },
      { status: 409 }
    );
  }

  await prisma.role.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
