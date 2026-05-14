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
  category: string;
}

export function AlertasClient({ alerts }: { alerts: AlertItem[] }) {
  function copyShoppingList() {
    const lines = alerts.map(
      (a) => `• ${a.name} (${a.category}): pedir ${formatStock(a.quantityToOrder, a.unit)}`
    );
    const text = `Lista de compras — ${new Date().toLocaleDateString("es-CO")}\n\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text);
    toast.success("Lista copiada al portapapeles");
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Todo el stock está en orden</p>
        <p className="text-slate-400 text-sm mt-1">No hay productos por debajo del mínimo</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={copyShoppingList}>
          <ClipboardList className="w-4 h-4 mr-1.5" />
          Copiar lista de compras
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Producto</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Categoría</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Stock actual</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Mínimo</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Déficit</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">A pedir</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {alerts.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{a.name}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{a.category}</td>
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
      </div>
    </div>
  );
}
