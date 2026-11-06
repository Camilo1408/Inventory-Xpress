import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageUsers } from "@/lib/permissions";
import { isBaseRole, sanitizePermissionKeys } from "@/lib/roles";
import bcrypt from "bcryptjs";
import { config } from "@/lib/config";
import { z } from "zod";
import { parseBody } from "@/lib/api-body";

const updateUserSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  active: z.boolean().optional(),
  customRoleId: z.string().nullish(),
  permsGrant: z.unknown().optional(),
  permsRevoke: z.unknown().optional(),
  password: z.string().nullish(),
});

function isStandalone() {
  return config.features.userManagement;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = await parseBody(req, updateUserSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Salvaguarda: no permitir que el último SUPERADMIN activo pierda el rol o se desactive.
  if (body.role !== undefined || body.active === false) {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "SUPERADMIN") {
      const losingSuperadmin = (body.role !== undefined && body.role !== "SUPERADMIN") || body.active === false;
      if (losingSuperadmin) {
        const count = await prisma.user.count({ where: { role: "SUPERADMIN", active: true } });
        if (count <= 1) {
          return NextResponse.json(
            { error: "No puedes quitar/desactivar el último SUPERADMIN activo." },
            { status: 409 }
          );
        }
      }
    }
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.role !== undefined && isBaseRole(body.role)) data.role = body.role;
  if (body.active !== undefined) data.active = body.active;
  if (body.customRoleId !== undefined) {
    data.customRoleId = body.customRoleId
      ? (await prisma.role.findUnique({ where: { id: body.customRoleId }, select: { id: true } }))?.id ?? null
      : null;
  }
  if (body.permsGrant  !== undefined) data.permsGrant  = JSON.stringify(sanitizePermissionKeys(body.permsGrant));
  if (body.permsRevoke !== undefined) data.permsRevoke = JSON.stringify(sanitizePermissionKeys(body.permsRevoke));
  if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, name: true, role: true, active: true },
  });

  return NextResponse.json({ user });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.user.update({ where: { id }, data: { active: false } });

  return NextResponse.json({ ok: true });
}
