import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageUsers } from "@/lib/permissions";
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
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
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

  const body = await req.json() as { username?: string; password?: string; name?: string; role?: string };
  if (!body.username?.trim() || !body.password) {
    return NextResponse.json({ error: "Usuario y contraseña son requeridos" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      username: body.username.trim(),
      passwordHash,
      name: body.name?.trim() ?? null,
      role: body.role ?? "EMPLOYEE",
    },
    select: { id: true, username: true, name: true, role: true, active: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
