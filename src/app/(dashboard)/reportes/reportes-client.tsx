"use client";

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatStock } from "@/lib/utils";
import { TrendingUp, TrendingDown, Package, Search } from "lucide-react";

interface Category { id: string; name: string }

interface ReportRow {
  id: string;
  name: string;
  unit: string;
  category: string;
  subcategory: string;
  stockInitial: number;
  entries: number;
  exits: number;
  currentStock: number;
  active: boolean;
}

type StatusFilter = "all" | "active" | "inactive";

const PERIOD_LABELS: Record<string, string> = {
  week:      "Esta semana",
  fortnight: "Esta quincena",
  month:     "Este mes",
  all:       "Todo el tiempo",
};

export function ReportesClient({ categories }: { categories: Category[] }) {
  const [period, setPeriod]               = useState("month");
  const [rows, setRows]                   = useState<ReportRow[]>([]);
  const [loading, setLoading]             = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("active");
  const [search, setSearch]               = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?period=${period}`);
      const data = await res.json() as { rows?: ReportRow[] };
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [period]);

  // Carga el reporte al montar y cuando cambia el periodo. El setState-en-effect
  // (setLoading/setRows dentro de fetchReport) es el patrón estándar de fetch de
  // datos y es intencional.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchReport(); }, [fetchReport]);

  // Subcategorías disponibles según la categoría seleccionada (derivadas de las
  // filas). Con "Todas las categorías" se listan todas las subcategorías presentes.
  const subcategoryOptions = Array.from(
    new Set(
      rows
        .filter((r) => categoryFilter === "all" || r.category === categoryFilter)
        .map((r) => r.subcategory)
        .filter((s): s is string => !!s)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filtered = rows.filter((r) => {
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (subcategoryFilter !== "all" && r.subcategory !== subcategoryFilter) return false;
    if (statusFilter === "active"   && !r.active) return false;
    if (statusFilter === "inactive" &&  r.active) return false;
    if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const withMovements = filtered.filter((r) => r.entries > 0 || r.exits > 0).length;
  const withoutStock  = filtered.filter((r) => r.active && r.currentStock <= 0).length;

  return (
    <div className="space-y-4">
      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Período */}
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="fortnight">Esta quincena</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="all">Todo el tiempo</SelectItem>
          </SelectContent>
        </Select>

        {/* Categoría raíz */}
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setSubcategoryFilter("all"); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Subcategoría — solo cuando hay una raíz seleccionada con opciones */}
        {categoryFilter !== "all" && subcategoryOptions.length > 0 && (
          <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todas las subcategorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las subcategorías</SelectItem>
              {subcategoryOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Estado */}
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

        {/* Búsqueda */}
        <div className="relative w-full sm:w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="h-10 pl-9 pr-3 w-full rounded-md border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          />
        </div>
      </div>

      {/* ── Tarjetas resumen ─────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Productos</p>
              <p className="text-xl font-bold text-slate-800">{filtered.length}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Con movimientos en período</p>
              <p className="text-xl font-bold text-emerald-600">{withMovements}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Sin stock (activos)</p>
              <p className="text-xl font-bold text-red-500">{withoutStock}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            {PERIOD_LABELS[period]}
          </p>
          <span className="text-xs text-slate-400">{filtered.length} productos</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Producto</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Categoría</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Subcategoría</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Stock inicial</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Entradas</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Salidas</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Stock actual</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    Cargando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {rows.length === 0
                      ? "No hay productos registrados"
                      : "Ningún producto coincide con los filtros seleccionados"}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-slate-50 ${!row.active ? "opacity-60" : ""}`}
                  >
                    {/* Producto */}
                    <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {row.name}
                    </td>

                    {/* Categoría */}
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {row.category || <span className="text-slate-300 italic text-xs">—</span>}
                    </td>

                    {/* Subcategoría */}
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {row.subcategory || <span className="text-slate-300 text-xs">—</span>}
                    </td>

                    {/* Stock inicial */}
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600 whitespace-nowrap">
                      {formatStock(row.stockInitial, row.unit)}
                    </td>

                    {/* Entradas */}
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-medium whitespace-nowrap">
                      {row.entries > 0
                        ? <span className="text-emerald-600">+{formatStock(row.entries, row.unit)}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>

                    {/* Salidas */}
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-medium whitespace-nowrap">
                      {row.exits > 0
                        ? <span className="text-red-500">{formatStock(row.exits, row.unit)}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>

                    {/* Stock actual */}
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                      {formatStock(row.currentStock, row.unit)}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {row.active
                        ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Activo</Badge>
                        : <Badge className="bg-slate-100 text-slate-400 border-0 text-xs">Inactivo</Badge>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
