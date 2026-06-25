import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import { isAdminRole } from "@/lib/permissions";
import { purgeOldAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { AuditFilters } from "./audit-filters";

const ACTION_LABEL: Record<string, string> = {
  "daily.open": "Apertura inventario",
  "daily.close": "Cierre inventario",
  "daily.reopen": "Reapertura inventario",
  "daily.edit": "Edición inventario",
  "category.create": "Categoría creada",
  "category.permissions.autocreate": "Permisos auto-creados",
  "access.denied": "Acceso denegado",
};

const ACTION_BADGE: Record<string, string> = {
  "daily.open": "bg-blue-100 text-blue-700 border-0",
  "daily.close": "bg-emerald-100 text-emerald-700 border-0",
  "daily.reopen": "bg-amber-100 text-amber-700 border-0",
  "daily.edit": "bg-slate-100 text-slate-600 border-0",
  "category.create": "bg-violet-100 text-violet-700 border-0",
  "category.permissions.autocreate": "bg-violet-100 text-violet-700 border-0",
  "access.denied": "bg-red-100 text-red-700 border-0",
};

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string; q?: string; user?: string; action?: string; result?: string; from?: string; to?: string;
  }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isAdminRole(session.user)) redirect("/");

  // Mantener la tabla acotada a 6 meses en cada visita al panel.
  await purgeOldAudit().catch(() => 0);

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1"));
  const limit = 30;

  // Construir el filtro a partir de los parámetros de búsqueda.
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.action) where.action = sp.action;
  if (sp.result) where.result = sp.result;
  if (sp.user) where.userName = sp.user;
  if (sp.from || sp.to) {
    where.createdAt = {
      ...(sp.from && { gte: new Date(sp.from) }),
      ...(sp.to && { lte: new Date(`${sp.to}T23:59:59.999`) }),
    };
  }
  if (sp.q?.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { summary: { contains: q } },
      { userName: { contains: q } },
      { categoryName: { contains: q } },
    ];
  }

  const [logs, total, distinctUsers, directoryUsers] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["userName"], select: { userName: true } }),
    // Directorio de usuarios con acceso a inventario (modo standalone: tabla User).
    // En modo integrado esta tabla está vacía y los usuarios vienen del JWT de Nómina.
    prisma.user.findMany({ where: { active: true }, select: { name: true, username: true } }),
  ]);

  // El nombre mostrado en auditoría es `name ?? username`; el directorio usa la misma regla.
  // En standalone todos los usuarios activos tienen acceso a inventario (modelo por rol),
  // así que aparecen automáticamente al crearlos en Gestión de usuarios.
  const directoryNames = directoryUsers.map((u) => u.name ?? u.username);
  const auditNames = distinctUsers.map((u) => u.userName);
  // Unión: todos los usuarios con acceso + cualquiera que ya tenga eventos (auto-actualizable).
  const users = Array.from(new Set([...directoryNames, ...auditNames])).sort((a, b) => a.localeCompare(b));
  const actionOptions = Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }));

  // Querystring base para conservar los filtros en la paginación.
  const baseParams = new URLSearchParams();
  for (const k of ["q", "user", "action", "result", "from", "to"] as const) {
    if (sp[k]) baseParams.set(k, sp[k] as string);
  }
  const pageHref = (p: number) => {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Auditoría</h1>
        <p className="text-slate-500 text-sm mt-1">
          Registro de acciones del sistema · {total} eventos · retención de 6 meses
        </p>
      </div>

      <div className="mb-4">
        <AuditFilters
          users={users}
          actions={actionOptions}
          current={{ q: sp.q, user: sp.user, action: sp.action, result: sp.result, from: sp.from, to: sp.to }}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Fecha</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Acción</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Categoría</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Usuario</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Detalle</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(l.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge className={ACTION_BADGE[l.action] ?? "bg-slate-100 text-slate-600 border-0"}>
                      {ACTION_LABEL[l.action] ?? l.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{l.categoryName ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{l.userName}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{l.summary}</td>
                  <td className="px-4 py-3 text-center">
                    {l.result === "denied" ? (
                      <Badge className="bg-red-100 text-red-700 border-0">Denegado</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No hay eventos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
            <span>Página {page} de {Math.ceil(total / limit)}</span>
            <div className="flex gap-2">
              {page > 1 && <a href={pageHref(page - 1)} className="text-blue-600 hover:underline">Anterior</a>}
              {page * limit < total && <a href={pageHref(page + 1)} className="text-blue-600 hover:underline">Siguiente</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
