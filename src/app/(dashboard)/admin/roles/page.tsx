import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canManageUsers } from "@/lib/permissions";
import { config } from "@/lib/config";
import {
  PERMISSION_CATALOG,
  BASE_ROLES,
  BASE_ROLE_LABEL,
  BASE_ROLE_DESCRIPTION,
  BASE_ROLE_PERMISSIONS,
  sanitizePermissionKeys,
} from "@/lib/roles";
import { RolesClient } from "./roles-client";

export default async function RolesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!config.features.userManagement) redirect("/");
  if (!canManageUsers(session.user)) redirect("/");

  const roles = await prisma.role.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true } } },
  });

  const rolesData = roles.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    permissions: sanitizePermissionKeys(safeParse(r.permissions)),
    active: r.active,
    userCount: r._count.users,
  }));

  const baseRoles = BASE_ROLES.map((role) => ({
    role,
    label: BASE_ROLE_LABEL[role],
    description: BASE_ROLE_DESCRIPTION[role],
    permissions: BASE_ROLE_PERMISSIONS[role],
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Roles</h1>
        <p className="text-slate-500 text-sm mt-1">
          Define conjuntos de permisos asignables a los usuarios del inventario.
        </p>
      </div>
      <RolesClient roles={rolesData} catalog={[...PERMISSION_CATALOG]} baseRoles={baseRoles} />
    </div>
  );
}

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return []; }
}
