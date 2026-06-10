"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Package, Search, PowerOff, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getStockStatus, formatStock } from "@/lib/utils";
import { toast } from "sonner";

interface Category { id: string; name: string }
interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  imageUrl: string | null;
  active: boolean;
  category: { id: string; name: string } | null;
}

interface ProductTableProps {
  products: Product[];
  categories: Category[];
  canManage: boolean;
}

const stockBadge = {
  ok:    "bg-emerald-100 text-emerald-700 border-0",
  low:   "bg-amber-100 text-amber-700 border-0",
  empty: "bg-red-100 text-red-700 border-0",
};
const stockLabel = {
  ok:    "En stock",
  low:   "Bajo mínimo",
  empty: "Sin stock",
};

type StatusFilter = "all" | "active" | "inactive";

export function ProductTable({ products, categories, canManage }: ProductTableProps) {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("all");
  const [search, setSearch]                 = useState("");
  const [actionTarget, setActionTarget]     = useState<{ id: string; name: string; activate: boolean } | null>(null);
  const [processing, setProcessing]         = useState(false);

  const filtered = products.filter((p) => {
    const matchesCategory = categoryFilter === "all" || p.category?.id === categoryFilter;
    const matchesStatus   =
      statusFilter === "all" ||
      (statusFilter === "active"   && p.active) ||
      (statusFilter === "inactive" && !p.active);
    const matchesSearch =
      search.trim() === "" ||
      p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      (p.category?.name ?? "").toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesStatus && matchesSearch;
  });

  async function confirmAction() {
    if (!actionTarget) return;
    setProcessing(true);
    const res = await fetch(`/api/products/${actionTarget.id}`, {
      method: actionTarget.activate ? "PATCH" : "DELETE",
      ...(actionTarget.activate && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }),
    });
    setProcessing(false);
    setActionTarget(null);
    if (res.ok) {
      toast.success(actionTarget.activate
        ? `"${actionTarget.name}" reactivado`
        : `"${actionTarget.name}" desactivado`
      );
      router.refresh();
    } else {
      toast.error("Error al procesar la acción");
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="h-10 pl-9 pr-3 w-56 rounded-md border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          />
        </div>

        {/* Filtro por categoría */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro por estado */}
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm">
          {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "all" ? "Todos" : s === "active" ? "Activos" : "Inactivos"}
            </button>
          ))}
        </div>

        <span className="text-sm text-slate-400">{filtered.length} productos</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Producto</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Categoría</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Stock actual</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Mínimo</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Estado</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => {
              const status = getStockStatus(p.currentStock, p.minStock);
              return (
                <tr
                  key={p.id}
                  className={`transition-colors ${p.active ? "hover:bg-slate-50" : "bg-slate-50/60 opacity-70"}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        <Image
                          src={p.imageUrl}
                          alt={p.name}
                          width={36}
                          height={36}
                          className="rounded object-cover border border-slate-100"
                          unoptimized
                        />
                      ) : (
                        <div className="w-9 h-9 bg-slate-100 rounded flex items-center justify-center">
                          <Package className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <span className={`text-sm font-medium ${p.active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                          {p.name}
                        </span>
                        {!p.active && (
                          <span className="ml-2 text-xs text-red-500 font-normal no-underline" style={{ textDecoration: "none" }}>
                            Inactivo
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.category
                      ? <span className="text-slate-500">{p.category.name}</span>
                      : <span className="text-slate-300 italic text-xs">Sin categoría</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800 tabular-nums">
                    {formatStock(p.currentStock, p.unit)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-400 tabular-nums">
                    {p.minStock > 0 ? formatStock(p.minStock, p.unit) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.active
                      ? <Badge className={stockBadge[status]}>{stockLabel[status]}</Badge>
                      : <Badge className="bg-slate-100 text-slate-400 border-0">Inactivo</Badge>
                    }
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/productos/${p.id}/editar`}>
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          </Link>
                        </Button>
                        {p.active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Desactivar producto"
                            onClick={() => setActionTarget({ id: p.id, name: p.name, activate: false })}
                          >
                            <PowerOff className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Reactivar producto"
                            onClick={() => setActionTarget({ id: p.id, name: p.name, activate: true })}
                          >
                            <Power className="w-3.5 h-3.5 text-emerald-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay productos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!actionTarget}
        onOpenChange={(v) => { if (!v) setActionTarget(null); }}
        title={actionTarget?.activate
          ? `Reactivar "${actionTarget?.name}"`
          : `Desactivar "${actionTarget?.name}"`
        }
        description={actionTarget?.activate
          ? "El producto volverá a estar disponible en el inventario diario, movimientos y conteos."
          : "El producto se mantendrá en el sistema con todo su historial, pero no aparecerá en el inventario diario ni estará disponible para nuevos movimientos."
        }
        confirmLabel={actionTarget?.activate ? "Reactivar" : "Desactivar"}
        variant={actionTarget?.activate ? "default" : "destructive"}
        loading={processing}
        onConfirm={confirmAction}
      />
    </div>
  );
}
