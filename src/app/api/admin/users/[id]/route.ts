import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageUsers } from "@/lib/permissions";

function isStandalone() {
  return process.env.AUTH_MODE === "standalone";
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { name?: string; role?: string; active?: boolean };

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.active !== undefined && { active: body.active }),
    },
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
