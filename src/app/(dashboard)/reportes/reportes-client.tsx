"use client";

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatStock } from "@/lib/utils";

interface Category { id: string; name: string }
interface ReportItem {
  productId: string;
  name: string;
  unit: string;
  total: number;
}

export function ReportesClient({ categories }: { categories: Category[] }) {
  const [category, setCategory] = useState("Barra");
  const [period, setPeriod] = useState("month");
  const [results, setResults] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/reports?category=${encodeURIComponent(category)}&period=${period}`);
    const data = await res.json() as { results?: ReportItem[] };
    setResults(data.results ?? []);
    setLoading(false);
  }, [category, period]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const periodLabel: Record<string, string> = {
    week: "esta semana",
    month: "este mes",
    all: "histórico",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="all">Todo el tiempo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-500">
            Top productos más consumidos en <strong>{category}</strong> — {periodLabel[period]}
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">#</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Producto</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Total consumido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay datos para el período seleccionado
                </td>
              </tr>
            ) : (
              results.map((item, i) => (
                <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-800">
                    {formatStock(item.total, item.unit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
