"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  category: { id: string; name: string };
}

interface ProductTableProps {
  products: Product[];
  categories: Category[];
  canManage: boolean;
}

const stockBadge = {
  ok: "bg-emerald-100 text-emerald-700 border-0",
  low: "bg-amber-100 text-amber-700 border-0",
  empty: "bg-red-100 text-red-700 border-0",
};
const stockLabel = {
  ok: "En stock",
  low: "Bajo mínimo",
  empty: "Sin stock",
};

export function ProductTable({ products, categories, canManage }: ProductTableProps) {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = categoryFilter === "all"
    ? products
    : products.filter((p) => p.category.id === categoryFilter);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Desactivar "${name}"?`)) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Producto desactivado");
      router.refresh();
    } else {
      toast.error("Error al desactivar");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
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
        <span className="text-sm text-slate-400">{filtered.length} productos</span>
      </div>

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
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
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
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{p.category.name}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800 tabular-nums">
                    {formatStock(p.currentStock, p.unit)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-400 tabular-nums">
                    {p.minStock > 0 ? formatStock(p.minStock, p.unit) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={stockBadge[status]}>{stockLabel[status]}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/productos/${p.id}/editar`}>
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
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
    </div>
  );
}
