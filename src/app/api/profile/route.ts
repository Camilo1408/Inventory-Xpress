import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { config } from "@/lib/config";

function isStandalone() {
  return config.features.userManagement;
}

/** PATCH /api/profile — el usuario en sesión edita su propio usuario/contraseña. */
export async function PATCH(req: Request) {
  // En modo integrado, el perfil se gestiona en Nómina Xpress.
  if (!isStandalone()) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json() as {
    currentPassword?: string;
    newUsername?: string;
    newPassword?: string;
  };

  if (!body.currentPassword) {
    return NextResponse.json({ error: "Ingresa tu contraseña actual" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 401 });
  }

  const data: Record<string, unknown> = {};

  // Cambio de usuario (opcional).
  const newUsername = body.newUsername?.trim();
  if (newUsername && newUsername !== user.username) {
    if (newUsername.length < 3 || /\s/.test(newUsername)) {
      return NextResponse.json({ error: "El usuario debe tener mínimo 3 caracteres y sin espacios" }, { status: 400 });
    }
    const taken = await prisma.user.findFirst({
      where: { username: newUsername, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: "Ese nombre de usuario ya está en uso" }, { status: 409 });
    }
    data.username = newUsername;
  }

  // Cambio de contraseña (opcional).
  if (body.newPassword) {
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "La nueva contraseña debe tener mínimo 6 caracteres" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(body.newPassword, 12);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No hay cambios para guardar" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data });

  return NextResponse.json({ ok: true, username: (data.username as string) ?? user.username });
}
