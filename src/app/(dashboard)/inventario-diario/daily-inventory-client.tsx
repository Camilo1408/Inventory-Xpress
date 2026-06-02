"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatStock } from "@/lib/utils";
import { ClipboardList, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  category: { name: string };
}

interface InventoryItem {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string; currentStock: number };
  initialCount: number;
  finalCount: number | null;
}

interface DailyInventory {
  id: string;
  date: string;
  status: string;
  userName: string;
  closedBy?: string | null;
  items: InventoryItem[];
}

interface Movement {
  productId: string;
  type: string;
  quantity: number;
}

interface Props {
  date: string;
  existing: DailyInventory | null;
  movements: Movement[];
  allProducts: Product[];
  isSuperAdmin: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function calcMovements(movements: Movement[], productId: string) {
  const entries = movements
    .filter((m) => m.productId === productId && m.type === "ENTRY")
    .reduce((s, m) => s + Math.abs(m.quantity), 0);
  const exits = movements
    .filter((m) => m.productId === productId && m.type === "EXIT")
    .reduce((s, m) => s + Math.abs(m.quantity), 0);
  return { entries, exits };
}

// ─── View: Sin inventario (crear) ────────────────────────────────────────────

function CreateView({ date, allProducts }: { date: string; allProducts: Product[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Agrupar por categoría
  const byCategory = allProducts.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category.name;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const items = allProducts.map((p) => ({
      productId: p.id,
      initialCount: parseFloat(counts[p.id] ?? "0") || 0,
    }));
    setLoading(true);
    const res = await fetch("/api/daily-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, items }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Inventario del día iniciado");
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al iniciar inventario");
    }
  }

  return (
    <form onSubmit={handleStart} className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <ClipboardList className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Conteo inicial del día</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Registra las existencias físicas actuales para cada producto. Esto servirá como punto de partida para comparar al final del turno.
          </p>
        </div>
      </div>

      {Object.entries(byCategory).map(([cat, products]) => (
        <div key={cat} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Producto</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-500">Stock sistema</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-500 w-36">Conteo inicial *</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                    {formatStock(p.currentStock, p.unit)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      className="w-28 ml-auto text-right tabular-nums"
                      value={counts[p.id] ?? ""}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
        {loading ? "Guardando..." : "Iniciar inventario del día"}
      </Button>
    </form>
  );
}

// ─── View: Inventario abierto (mostrar progreso + conteo final) ────────────────

function OpenView({
  inventory,
  movements,
}: {
  inventory: DailyInventory;
  movements: Movement[];
}) {
  const router = useRouter();
  const [finalCounts, setFinalCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showFinalForm, setShowFinalForm] = useState(false);

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    const items = inventory.items.map((item) => ({
      productId: item.productId,
      finalCount: parseFloat(finalCounts[item.productId] ?? "0") || 0,
    }));
    setLoading(true);
    const res = await fetch(`/api/daily-inventory/${inventory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalCounts: items }),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Jornada cerrada correctamente");
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al cerrar");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
        <ClipboardList className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Jornada en curso</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Los movimientos registrados durante el día se reflejan en tiempo real. Al final de la jornada, realiza el conteo físico final.
          </p>
        </div>
      </div>

      {/* Tabla de progreso */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Producto</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Inicial</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500 text-emerald-600">+ Entradas</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500 text-red-500">− Salidas</th>
              <th className="text-right px-4 py-3 font-medium text-slate-700">Esperado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inventory.items.map((item) => {
              const { entries, exits } = calcMovements(movements, item.productId);
              const expected = item.initialCount + entries - exits;
              return (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.product.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatStock(item.initialCount, item.product.unit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                    {entries > 0 ? `+${formatStock(entries, item.product.unit)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-500">
                    {exits > 0 ? `−${formatStock(exits, item.product.unit)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">
                    {formatStock(expected, item.product.unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!showFinalForm ? (
        <Button onClick={() => setShowFinalForm(true)} className="bg-blue-600 hover:bg-blue-700">
          Realizar conteo final y cerrar jornada
        </Button>
      ) : (
        <form onSubmit={handleClose} className="space-y-4">
          <h3 className="text-base font-semibold text-slate-800">Conteo físico final</h3>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Producto</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">Esperado</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500 w-36">Conteo real *</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {inventory.items.map((item) => {
                  const { entries, exits } = calcMovements(movements, item.productId);
                  const expected = item.initialCount + entries - exits;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{item.product.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {formatStock(expected, item.product.unit)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          className="w-28 ml-auto text-right tabular-nums"
                          value={finalCounts[item.productId] ?? ""}
                          onChange={(e) =>
                            setFinalCounts((prev) => ({ ...prev, [item.productId]: e.target.value }))
                          }
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? "Cerrando..." : "Confirmar y cerrar jornada"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowFinalForm(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── View: Inventario cerrado (resultados) ───────────────────────────────────

function ClosedView({
  inventory,
  movements,
}: {
  inventory: DailyInventory;
  movements: Movement[];
}) {
  const hasDiscrepancies = inventory.items.some((item) => {
    const { entries, exits } = calcMovements(movements, item.productId);
    const expected = item.initialCount + entries - exits;
    const diff = (item.finalCount ?? 0) - expected;
    return Math.abs(diff) > 0.001;
  });

  return (
    <div className="space-y-6">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Jornada cerrada</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Cerrado por {inventory.closedBy ?? "—"}.{" "}
            {hasDiscrepancies
              ? "Se encontraron diferencias. Revisa los detalles abajo."
              : "Todo coincide correctamente."}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Producto</th>
              <th className="text-right px-4 py-3 font-medium text-slate-500">Inicial</th>
              <th className="text-right px-4 py-3 font-medium text-emerald-600">Entradas</th>
              <th className="text-right px-4 py-3 font-medium text-red-500">Salidas</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Esperado</th>
              <th className="text-right px-4 py-3 font-medium text-slate-800">Conteo final</th>
              <th className="text-center px-4 py-3 font-medium text-slate-500">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inventory.items.map((item) => {
              const { entries, exits } = calcMovements(movements, item.productId);
              const expected    = item.initialCount + entries - exits;
              const finalCount  = item.finalCount ?? 0;
              const diff        = finalCount - expected;
              const hasGap      = Math.abs(diff) > 0.001;

              return (
                <tr key={item.id} className={hasGap ? "bg-amber-50/50" : ""}>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.product.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {formatStock(item.initialCount, item.product.unit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                    {entries > 0 ? `+${formatStock(entries, item.product.unit)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-500">
                    {exits > 0 ? `−${formatStock(exits, item.product.unit)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatStock(expected, item.product.unit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">
                    {formatStock(finalCount, item.product.unit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!hasGap ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <Minus className="w-3 h-3" /> Sin diferencia
                      </span>
                    ) : diff > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium">
                        <TrendingUp className="w-3 h-3" />
                        +{formatStock(diff, item.product.unit)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                        <TrendingDown className="w-3 h-3" />
                        {formatStock(diff, item.product.unit)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasDiscrepancies && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Se encontraron diferencias</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Las diferencias positivas indican que hay más stock del esperado (posibles entradas no registradas).
              Las diferencias negativas indican merma o salidas no registradas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root Component ──────────────────────────────────────────────────────────

export function DailyInventoryClient({ date, existing, movements, allProducts }: Props) {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario Diario</h1>
          <p className="text-slate-500 text-sm mt-1 capitalize">{formatDate(date)}</p>
        </div>
        {existing && (
          <Badge className={
            existing.status === "closed"
              ? "bg-emerald-100 text-emerald-700 border-0"
              : "bg-amber-100 text-amber-700 border-0"
          }>
            {existing.status === "closed" ? "Cerrado" : "En curso"}
          </Badge>
        )}
      </div>

      {/* Contenido según estado */}
      {!existing ? (
        <CreateView date={date} allProducts={allProducts} />
      ) : existing.status === "open" ? (
        <OpenView inventory={existing} movements={movements} />
      ) : (
        <ClosedView inventory={existing} movements={movements} />
      )}
    </div>
  );
}
