"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle } from "lucide-react";
import { formatStock } from "@/lib/utils";
import { toast } from "sonner";

interface AlertItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  deficit: number;
  quantityToOrder: number;
  rootCategory: string;
  subCategory: string;
}

interface BottleAlertItem {
  id: string;
  name: string;
  rootCategory: string;
  subCategory: string;
  levelLabel: string;
  reserve: number;
}

type AnyAlert =
  | { kind: "numeric"; data: AlertItem }
  | { kind: "bottle"; data: BottleAlertItem };

/** Agrupa alertas en Map<rootCategory, Map<subCategory, AnyAlert[]>> manteniendo el orden de inserción. */
function groupAlerts(alerts: AlertItem[], bottleAlerts: BottleAlertItem[]) {
  const groups = new Map<string, Map<string, AnyAlert[]>>();

  function add(root: string, sub: string, item: AnyAlert) {
    if (!groups.has(root)) groups.set(root, new Map());
    const subs = groups.get(root)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(item);
  }

  for (const a of alerts) add(a.rootCategory, a.subCategory, { kind: "numeric", data: a });
  for (const b of bottleAlerts) add(b.rootCategory, b.subCategory, { kind: "bottle", data: b });

  return groups;
}

export function AlertasClient({ alerts, bottleAlerts }: { alerts: AlertItem[]; bottleAlerts: BottleAlertItem[] }) {
  const groups = groupAlerts(alerts, bottleAlerts);

  function copyShoppingList() {
    const sections: string[] = [];

    for (const [root, subMap] of groups) {
      const rootLines: string[] = [];
      for (const [sub, items] of subMap) {
        const header = root === sub ? null : `  [${sub}]`;
        const lines = items.map((item) => {
          if (item.kind === "numeric") {
            const a = item.data;
            return `  • ${a.name}: pedir ${formatStock(a.quantityToOrder, a.unit)}`;
          } else {
            const b = item.data;
            return `  • ${b.name}: ${b.levelLabel}, sin reserva → comprar`;
          }
        });
        rootLines.push(...(header ? [header, ...lines] : lines));
      }
      sections.push(`== ${root.toUpperCase()} ==\n\n${rootLines.join("\n")}`);
    }

    const text = `Lista de compras — ${new Date().toLocaleDateString("es-CO")}\n\n${sections.join("\n\n")}`;
    navigator.clipboard.writeText(text);
    toast.success("Lista copiada al portapapeles");
  }

  if (groups.size === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Todo el stock está en orden</p>
        <p className="text-slate-400 text-sm mt-1">No hay productos por debajo del mínimo</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={copyShoppingList}>
          <ClipboardList className="w-4 h-4 mr-1.5" />
          Copiar lista de compras
        </Button>
      </div>

      {[...groups.entries()].map(([root, subMap]) => (
        <div key={root} className="space-y-3">
          {/* Encabezado categoría raíz */}
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
            {root}
          </h2>

          {[...subMap.entries()].map(([sub, items]) => {
            const numericItems = items.filter((i): i is { kind: "numeric"; data: AlertItem } => i.kind === "numeric");
            const bottleItems  = items.filter((i): i is { kind: "bottle"; data: BottleAlertItem } => i.kind === "bottle");
            const showSubHeader = root !== sub;

            return (
              <div key={sub} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                {showSubHeader && (
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                    <span className="text-xs font-semibold text-slate-500">{sub}</span>
                  </div>
                )}

                {/* Ítems de botella */}
                {bottleItems.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    {bottleItems.map(({ data: b }) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm font-medium text-slate-800">{b.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className="bg-red-100 text-red-700 border-0">{b.levelLabel}, sin reserva</Badge>
                          <span className="text-xs text-slate-500">Comprar</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ítems numéricos — móvil: tarjetas */}
                {numericItems.length > 0 && (
                  <div className="md:hidden divide-y divide-slate-100">
                    {numericItems.map(({ data: a }) => (
                      <div key={a.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800 break-words">{a.name}</span>
                          <Badge className={`shrink-0 ${a.currentStock <= 0 ? "bg-red-100 text-red-700 border-0" : "bg-amber-100 text-amber-700 border-0"}`}>
                            {a.currentStock <= 0 ? "Sin stock" : "Bajo mínimo"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
                          <span className="text-slate-500">Actual <strong className="text-slate-800 tabular-nums">{formatStock(a.currentStock, a.unit)}</strong></span>
                          <span className="text-slate-500">Mín <strong className="text-slate-600 tabular-nums">{formatStock(a.minStock, a.unit)}</strong></span>
                          <span className="text-red-600 tabular-nums">Déficit {formatStock(a.deficit, a.unit)}</span>
                          <span className="text-blue-600 font-semibold tabular-nums">A pedir {formatStock(a.quantityToOrder, a.unit)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ítems numéricos — escritorio: tabla */}
                {numericItems.length > 0 && (
                  <table className="hidden md:table w-full min-w-[620px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-2">Producto</th>
                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-2">Stock actual</th>
                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-2">Mínimo</th>
                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-2">Déficit</th>
                        <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-2">A pedir</th>
                        <th className="text-center text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {numericItems.map(({ data: a }) => (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{a.name}</td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-slate-800">
                            {formatStock(a.currentStock, a.unit)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-500">
                            {formatStock(a.minStock, a.unit)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums text-red-600 font-medium">
                            {formatStock(a.deficit, a.unit)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums text-blue-600 font-semibold">
                            {formatStock(a.quantityToOrder, a.unit)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={a.currentStock <= 0 ? "bg-red-100 text-red-700 border-0" : "bg-amber-100 text-amber-700 border-0"}>
                              {a.currentStock <= 0 ? "Sin stock" : "Bajo mínimo"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
