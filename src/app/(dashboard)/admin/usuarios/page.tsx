import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canManageUsers } from "@/lib/permissions";
import { config } from "@/lib/config";
import {
  PERMISSION_CATALOG,
  BASE_ROLES,
  BASE_ROLE_LABEL,
  BASE_ROLE_PERMISSIONS,
  parsePermissionsJson,
} from "@/lib/roles";
import { UsuariosClient } from "./usuarios-client";

export default async function UsuariosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (!config.features.userManagement) redirect("/");
  if (!canManageUsers(session.user)) redirect("/");

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, username: true, name: true, role: true, active: true,
        customRoleId: true, permsGrant: true, permsRevoke: true,
        customRole: { select: { id: true, name: true } },
      },
    }),
    prisma.role.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, permissions: true },
    }),
  ]);

  const usersData = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    active: u.active,
    customRoleId: u.customRoleId,
    customRoleName: u.customRole?.name ?? null,
    permsGrant: parsePermissionsJson(u.permsGrant),
    permsRevoke: parsePermissionsJson(u.permsRevoke),
  }));

  const rolesData = roles.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: parsePermissionsJson(r.permissions),
  }));

  const baseRoles = BASE_ROLES.map((role) => ({
    role,
    label: BASE_ROLE_LABEL[role],
    permissions: BASE_ROLE_PERMISSIONS[role],
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="text-slate-500 text-sm mt-1">Crea usuarios y asigna roles y permisos individuales.</p>
      </div>
      <UsuariosClient
        users={usersData}
        roles={rolesData}
        baseRoles={baseRoles}
        catalog={[...PERMISSION_CATALOG]}
      />
    </div>
  );
}
