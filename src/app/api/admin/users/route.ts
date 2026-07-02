import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageUsers } from "@/lib/permissions";
import { isBaseRole, sanitizePermissionKeys } from "@/lib/roles";
import bcrypt from "bcryptjs";

function isStandalone() {
  return process.env.AUTH_MODE === "standalone";
}

export async function GET() {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, username: true, name: true, role: true, active: true, createdAt: true,
      customRoleId: true, permsGrant: true, permsRevoke: true,
      customRole: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json() as {
    username?: string; password?: string; name?: string;
    role?: string; customRoleId?: string | null;
    permsGrant?: unknown; permsRevoke?: unknown;
  };
  if (!body.username?.trim() || !body.password) {
    return NextResponse.json({ error: "Usuario y contraseña son requeridos" }, { status: 400 });
  }

  const role = isBaseRole(body.role) ? body.role : "EMPLOYEE";
  const customRoleId = await resolveCustomRoleId(body.customRoleId);

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      username: body.username.trim(),
      passwordHash,
      name: body.name?.trim() ?? null,
      role,
      customRoleId,
      permsGrant:  JSON.stringify(sanitizePermissionKeys(body.permsGrant)),
      permsRevoke: JSON.stringify(sanitizePermissionKeys(body.permsRevoke)),
    },
    select: { id: true, username: true, name: true, role: true, active: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}

/** Valida que el customRoleId exista; devuelve null si no aplica o no existe. */
async function resolveCustomRoleId(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const role = await prisma.role.findUnique({ where: { id }, select: { id: true } });
  return role?.id ?? null;
}
