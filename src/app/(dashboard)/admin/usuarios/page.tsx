import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canManageUsers } from "@/lib/permissions";
import { UsuariosClient } from "./usuarios-client";

export default async function UsuariosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (process.env.AUTH_MODE !== "standalone") redirect("/");
  if (!canManageUsers(session.user)) redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, role: true, active: true },
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Gestión de usuarios</h1>
        <p className="text-slate-500 text-sm mt-1">Crea y administra usuarios del sistema</p>
      </div>
      <UsuariosClient users={users} />
    </div>
  );
}
