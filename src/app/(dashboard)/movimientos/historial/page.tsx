import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatStock } from "@/lib/utils";
import { canEditMovements } from "@/lib/permissions";
import { MovementActions } from "@/components/movements/movement-actions";

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string; productId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { page: pageStr, type, productId } = await searchParams;
  const page = parseInt(pageStr ?? "1");
  const limit = 20;

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(type && { type }),
      ...(productId && { productId }),
    },
    select: {
      id: true,
      type: true,
      source: true,
      quantity: true,
      notes: true,
      userName: true,
      createdAt: true,
      product: { select: { name: true, unit: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.stockMovement.count({
    where: {
      ...(type && { type }),
      ...(productId && { productId }),
    },
  });

  // Corrección de movimientos: solo manuales (source=null) y con permiso.
  const canEdit = canEditMovements(session.user);
  const editable = (m: { source: string | null; type: string }) =>
    canEdit && m.source === null && ["ENTRY", "EXIT", "ADJUSTMENT"].includes(m.type);

  const typeBadge: Record<string, string> = {
    ENTRY:         "bg-blue-100 text-blue-700 border-0",
    EXIT:          "bg-red-100 text-red-700 border-0",
    ADJUSTMENT:    "bg-slate-100 text-slate-600 border-0",
    BOTTLE_ADJUST: "bg-purple-100 text-purple-700 border-0",
  };
  const typeLabel: Record<string, string> = {
    ENTRY:         "Entrada",
    EXIT:          "Salida",
    ADJUSTMENT:    "Ajuste",
    BOTTLE_ADJUST: "Ajuste Botella",
  };

  function resolveLabel(type: string, source: string | null) {
    if (source === "bottle_adjust") return "Ajuste Botella";
    return typeLabel[type] ?? type;
  }
  function resolveBadge(type: string, source: string | null) {
    if (source === "bottle_adjust") return typeBadge.BOTTLE_ADJUST;
    return typeBadge[type] ?? "bg-slate-100 text-slate-600 border-0";
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Historial de movimientos</h1>
        <p className="text-slate-500 text-sm mt-1">{total} movimientos registrados</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Móvil: tarjeta por movimiento */}
        <div className="md:hidden divide-y divide-slate-100">
          {movements.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 break-words">{m.product.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(m.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${m.quantity >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {m.quantity >= 0 ? "+" : ""}
                    {formatStock(m.quantity, m.product.unit)}
                  </span>
                  <Badge className={resolveBadge(m.type, m.source)}>
                    {resolveLabel(m.type, m.source)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2 text-xs text-slate-400">
                <span className="truncate">{m.notes ?? "—"}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {m.userName}
                  {editable(m) && (
                    <MovementActions
                      movement={{ id: m.id, type: m.type, quantity: m.quantity, notes: m.notes, productName: m.product.name, unit: m.product.unit }}
                    />
                  )}
                </span>
              </div>
            </div>
          ))}
          {movements.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-400">No hay movimientos registrados</div>
          )}
        </div>

        {/* Escritorio: tabla */}
        <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Fecha</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Producto</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Tipo</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Cantidad</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Usuario</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Notas</th>
              {canEdit && <th className="w-20 px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {formatDate(m.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{m.product.name}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className={resolveBadge(m.type, m.source)}>
                    {resolveLabel(m.type, m.source)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                  <span className={m.quantity >= 0 ? "text-blue-600" : "text-red-600"}>
                    {m.quantity >= 0 ? "+" : ""}
                    {formatStock(m.quantity, m.product.unit)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{m.userName}</td>
                <td className="px-4 py-3 text-sm text-slate-400 max-w-xs truncate">{m.notes ?? "—"}</td>
                {canEdit && (
                  <td className="px-4 py-3">
                    {editable(m) && (
                      <MovementActions
                        movement={{ id: m.id, type: m.type, quantity: m.quantity, notes: m.notes, productName: m.product.name, unit: m.product.unit }}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay movimientos registrados
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
              {page > 1 && (
                <a href={`?page=${page - 1}`} className="text-blue-600 hover:underline">Anterior</a>
              )}
              {page * limit < total && (
                <a href={`?page=${page + 1}`} className="text-blue-600 hover:underline">Siguiente</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
