"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Package, Search, PowerOff, Power, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getStockStatus, formatStock } from "@/lib/utils";
import { toast } from "sonner";
import { BottleLevelBadge } from "@/components/inventario/bottle-level-selector";
import { isBottleTrackedSlug, bottleStock, type BottleLevel } from "@/lib/bottle";

interface SubCategory { id: string; name: string }
interface RootCategory { id: string; name: string; children: SubCategory[] }
interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  imageUrl: string | null;
  active: boolean;
  bottleLevel: string | null;
  reserveBottles: number | null;
  alertBottleLevel: string | null;
  category: { id: string; name: string; slug: string | null; parentId: string | null } | null;
}

interface ProductTableProps {
  products: Product[];
  rootCategories: RootCategory[];
  canManage: boolean;
  canHardDelete: boolean;
}

/** Raíz a la que pertenece un producto: su categoría si es raíz, o su categoría padre. */
function rootIdOf(p: Product): string | null {
  if (!p.category) return null;
  return p.category.parentId ?? p.category.id;
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

type ActionKind = "activate" | "deactivate" | "hardDelete";

// Persistencia de búsqueda/filtros/paginación entre navegaciones (p. ej. al entrar
// y salir de la vista de edición). Se guarda en sessionStorage: sobrevive mientras
// la pestaña esté abierta y se restaura al volver a /productos por cualquier vía.
const STORAGE_KEY = "productos:filtros";
const PER_PAGE_OPTIONS = [10, 15, 20];
const DEFAULT_PER_PAGE = 15;

interface PersistedFilters {
  search: string;
  rootFilter: string;
  subFilter: string;
  statusFilter: StatusFilter;
  page: number;
  perPage: number;
}

export function ProductTable({ products, rootCategories, canManage, canHardDelete }: ProductTableProps) {
  const router = useRouter();
  const [rootFilter, setRootFilter]         = useState("all");
  const [subFilter, setSubFilter]           = useState("all");
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("all");
  const [search, setSearch]                 = useState("");
  const [perPage, setPerPage]               = useState(DEFAULT_PER_PAGE);
  const [page, setPage]                     = useState(1);
  const [hydrated, setHydrated]             = useState(false);
  const [actionTarget, setActionTarget]     = useState<{ id: string; name: string; kind: ActionKind } | null>(null);
  const [processing, setProcessing]         = useState(false);

  // Restaurar filtros al montar (una vez). Se hace en un effect —y no en lazy-init de
  // useState— para no romper la hidratación: el servidor no tiene sessionStorage, así
  // que renderiza los defaults y el cliente los ajusta tras montar. Los setState del
  // bloque se agrupan en un solo re-render (batching), pero la regla de lint es
  // conservadora, por eso se acota aquí. Usa los setters directos a propósito, para no
  // disparar el reinicio de página de los handlers de cambio.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<PersistedFilters>;
        /* eslint-disable react-hooks/set-state-in-effect */
        if (typeof p.search === "string") setSearch(p.search);
        if (typeof p.rootFilter === "string") setRootFilter(p.rootFilter);
        if (typeof p.subFilter === "string") setSubFilter(p.subFilter);
        if (p.statusFilter === "all" || p.statusFilter === "active" || p.statusFilter === "inactive") setStatusFilter(p.statusFilter);
        if (typeof p.perPage === "number" && PER_PAGE_OPTIONS.includes(p.perPage)) setPerPage(p.perPage);
        if (typeof p.page === "number" && p.page >= 1) setPage(p.page);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // sessionStorage no disponible o JSON corrupto: se ignora, se usan defaults.
    }
    setHydrated(true);
  }, []);

  // Persistir tras la hidratación (evita sobrescribir con defaults antes de restaurar).
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ search, rootFilter, subFilter, statusFilter, page, perPage } satisfies PersistedFilters)
      );
    } catch {
      // best-effort
    }
  }, [hydrated, search, rootFilter, subFilter, statusFilter, page, perPage]);

  // Subcategorías de la raíz seleccionada (para el segundo select en cascada).
  const selectedRoot = rootCategories.find((r) => r.id === rootFilter);
  const subOptions = selectedRoot?.children ?? [];

  // Al cambiar la raíz, reiniciar la subcategoría (y volver a la primera página).
  function handleRootChange(value: string) {
    setRootFilter(value);
    setSubFilter("all");
    setPage(1);
  }

  const filtered = products.filter((p) => {
    const matchesRoot = rootFilter === "all" || rootIdOf(p) === rootFilter;
    const matchesSub  = subFilter === "all" || p.category?.id === subFilter;
    const matchesStatus   =
      statusFilter === "all" ||
      (statusFilter === "active"   && p.active) ||
      (statusFilter === "inactive" && !p.active);
    const matchesSearch =
      search.trim() === "" ||
      p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      (p.category?.name ?? "").toLowerCase().includes(search.trim().toLowerCase());
    return matchesRoot && matchesSub && matchesStatus && matchesSearch;
  });

  // Paginación (cliente). currentPage se acota por si el filtrado redujo el total.
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * perPage;
  const paged = filtered.slice(start, start + perPage);

  async function confirmAction() {
    if (!actionTarget) return;
    const { id, name, kind } = actionTarget;
    setProcessing(true);
    const res = await fetch(
      kind === "hardDelete" ? `/api/products/${id}?mode=hard` : `/api/products/${id}`,
      {
        method: kind === "activate" ? "PATCH" : "DELETE",
        ...(kind === "activate" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        }),
      }
    );
    setProcessing(false);
    setActionTarget(null);
    if (res.ok) {
      toast.success(
        kind === "activate" ? `"${name}" reactivado`
        : kind === "hardDelete" ? `"${name}" eliminado permanentemente`
        : `"${name}" desactivado`
      );
      router.refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (kind === "hardDelete" && data?.code === "HAS_HISTORY") {
        toast.error(data.error ?? "El producto tiene historial; desactívalo en su lugar.");
      } else {
        toast.error(data?.error ?? "Error al procesar la acción");
      }
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Búsqueda */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar producto..."
            className="h-10 pl-9 pr-3 w-full rounded-md border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          />
        </div>

        {/* Filtro por categoría raíz */}
        <Select value={rootFilter} onValueChange={handleRootChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {rootCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro por subcategoría — solo cuando hay una raíz seleccionada con hijos */}
        {selectedRoot && subOptions.length > 0 && (
          <Select value={subFilter} onValueChange={(v) => { setSubFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Todas las subcategorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las subcategorías</SelectItem>
              {subOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtro por estado */}
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm">
          {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatusFilter(s); setPage(1); }}
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

      {/* Móvil: tarjeta por producto */}
      <div className="md:hidden space-y-2.5">
        {paged.map((p) => {
          const isBottle = isBottleTrackedSlug(p.category?.slug);
          const status = getStockStatus(p.currentStock, p.minStock);
          const bottleLevel = p.bottleLevel as BottleLevel | null;
          const bottleTotal = isBottle ? bottleStock(bottleLevel, p.reserveBottles) : 0;
          const bottleReserve = p.reserveBottles ?? 0;
          const bottleStatus: "empty" | "low" | "ok" =
            bottleTotal === 0 ? "empty" : bottleReserve === 0 ? "low" : "ok";
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-3 flex gap-3 ${p.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/60 opacity-70"}`}
            >
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={p.name}
                  width={44}
                  height={44}
                  className="rounded object-cover border border-slate-100 shrink-0 h-11 w-11"
                  unoptimized
                />
              ) : (
                <div className="w-11 h-11 bg-slate-100 rounded flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-sm font-medium break-words ${p.active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {p.name}
                  </span>
                  {!p.active ? (
                    <Badge className="bg-slate-100 text-slate-400 border-0 shrink-0">Inactivo</Badge>
                  ) : isBottle ? (
                    <Badge className={`${stockBadge[bottleStatus]} shrink-0`}>{stockLabel[bottleStatus]}</Badge>
                  ) : (
                    <Badge className={`${stockBadge[status]} shrink-0`}>{stockLabel[status]}</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {p.category?.name ?? "Sin categoría"}
                </p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <div className="text-sm font-semibold text-slate-800 tabular-nums">
                    {isBottle ? (
                      <span className="flex items-center gap-2">
                        <BottleLevelBadge level={bottleLevel} />
                        {(p.reserveBottles ?? 0) > 0 && (
                          <span className="text-xs font-normal text-slate-400">+{p.reserveBottles} res.</span>
                        )}
                      </span>
                    ) : (
                      <>
                        {formatStock(p.currentStock, p.unit)}
                        {p.minStock > 0 && (
                          <span className="text-xs font-normal text-slate-400"> · mín {formatStock(p.minStock, p.unit)}</span>
                        )}
                      </>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/productos/${p.id}/editar`}>
                          <Pencil className="w-4 h-4 text-slate-400" />
                        </Link>
                      </Button>
                      {p.active ? (
                        <Button size="sm" variant="ghost" title="Desactivar producto" onClick={() => setActionTarget({ id: p.id, name: p.name, kind: "deactivate" })}>
                          <PowerOff className="w-4 h-4 text-red-400" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" title="Reactivar producto" onClick={() => setActionTarget({ id: p.id, name: p.name, kind: "activate" })}>
                          <Power className="w-4 h-4 text-emerald-500" />
                        </Button>
                      )}
                      {canHardDelete && (
                        <Button size="sm" variant="ghost" title="Eliminar permanentemente" onClick={() => setActionTarget({ id: p.id, name: p.name, kind: "hardDelete" })}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
            No hay productos
          </div>
        )}
      </div>

      {/* Escritorio: tabla */}
      <div className="hidden md:block bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[640px]">
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
            {paged.map((p) => {
              const isBottle = isBottleTrackedSlug(p.category?.slug);
              const status = getStockStatus(p.currentStock, p.minStock);
              const bottleLevel = p.bottleLevel as BottleLevel | null;
              // Estado de botella: 0 = sin stock, solo la abierta sin reserva = bajo,
              // con reserva (>=1 cerrada) = en stock.
              const bottleTotal = isBottle ? bottleStock(bottleLevel, p.reserveBottles) : 0;
              const bottleReserve = p.reserveBottles ?? 0;
              const bottleStatus: "empty" | "low" | "ok" =
                bottleTotal === 0 ? "empty" : bottleReserve === 0 ? "low" : "ok";
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
                    {isBottle ? (
                      <div className="flex items-center justify-end gap-2">
                        <BottleLevelBadge level={bottleLevel} />
                        {(p.reserveBottles ?? 0) > 0 && (
                          <span className="text-xs text-slate-400">+{p.reserveBottles} res.</span>
                        )}
                      </div>
                    ) : (
                      formatStock(p.currentStock, p.unit)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-400 tabular-nums">
                    {isBottle ? "—" : (p.minStock > 0 ? formatStock(p.minStock, p.unit) : "—")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!p.active ? (
                      <Badge className="bg-slate-100 text-slate-400 border-0">Inactivo</Badge>
                    ) : isBottle ? (
                      <Badge className={stockBadge[bottleStatus]}>{stockLabel[bottleStatus]}</Badge>
                    ) : (
                      <Badge className={stockBadge[status]}>{stockLabel[status]}</Badge>
                    )}
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
                            onClick={() => setActionTarget({ id: p.id, name: p.name, kind: "deactivate" })}
                          >
                            <PowerOff className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Reactivar producto"
                            onClick={() => setActionTarget({ id: p.id, name: p.name, kind: "activate" })}
                          >
                            <Power className="w-3.5 h-3.5 text-emerald-500" />
                          </Button>
                        )}
                        {canHardDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Eliminar permanentemente"
                            onClick={() => setActionTarget({ id: p.id, name: p.name, kind: "hardDelete" })}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
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

      {/* Paginación */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Por página</span>
            <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[72px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="tabular-nums">
              {start + 1}–{Math.min(start + perPage, total)} de {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-2"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-1 tabular-nums text-slate-600">{currentPage}/{totalPages}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-2"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!actionTarget}
        onOpenChange={(v) => { if (!v) setActionTarget(null); }}
        title={
          actionTarget?.kind === "activate"   ? `Reactivar "${actionTarget?.name}"`
          : actionTarget?.kind === "hardDelete" ? `Eliminar permanentemente "${actionTarget?.name}"`
          : `Desactivar "${actionTarget?.name}"`
        }
        description={
          actionTarget?.kind === "activate"
            ? "El producto volverá a estar disponible en el inventario diario, movimientos y conteos."
            : actionTarget?.kind === "hardDelete"
            ? "Esta acción es irreversible. El producto se borrará por completo. Solo es posible si no tiene historial (movimientos o inventario diario); de lo contrario deberás desactivarlo."
            : "El producto se mantendrá en el sistema con todo su historial, pero no aparecerá en el inventario diario ni estará disponible para nuevos movimientos."
        }
        confirmLabel={
          actionTarget?.kind === "activate" ? "Reactivar"
          : actionTarget?.kind === "hardDelete" ? "Eliminar definitivamente"
          : "Desactivar"
        }
        variant={actionTarget?.kind === "activate" ? "default" : "destructive"}
        loading={processing}
        onConfirm={confirmAction}
      />
    </div>
  );
}
