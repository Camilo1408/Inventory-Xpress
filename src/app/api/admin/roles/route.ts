import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageUsers } from "@/lib/permissions";
import { sanitizePermissionKeys } from "@/lib/roles";
import { uniqueSlug } from "@/lib/slug";

function isStandalone() {
  return process.env.AUTH_MODE === "standalone";
}

export async function GET() {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const roles = await prisma.role.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      permissions: sanitizePermissionKeys(safeParse(r.permissions)),
      active: r.active,
      userCount: r._count.users,
    })),
  });
}

export async function POST(req: Request) {
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageUsers(session.user)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const body = await req.json() as { name?: string; description?: string; permissions?: unknown };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "El nombre del rol es requerido" }, { status: 400 });
  }

  const existingSlugs = new Set((await prisma.role.findMany({ select: { slug: true } })).map((r) => r.slug));
  const slug = uniqueSlug(body.name.trim(), existingSlugs);
  const permissions = sanitizePermissionKeys(body.permissions);

  const role = await prisma.role.create({
    data: {
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || null,
      permissions: JSON.stringify(permissions),
    },
  });

  return NextResponse.json({ role }, { status: 201 });
}

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return []; }
}
