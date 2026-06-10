"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatStock } from "@/lib/utils";
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  History,
  ChevronDown,
  CalendarDays,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  category: { name: string } | null;
}

interface InventoryItem {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string; currentStock: number };
  initialCount: number;
  finalCount: number | null;
  unregisteredEntry: number | null;
  unregisteredExit: number | null;
}

interface DailyInventory {
  id: string;
  date: string;
  status: string;
  userName: string;
  closedBy?: string | null;
  reopenedBy?: string | null;
  reopenReason?: string | null;
  items: InventoryItem[];
}

interface Movement {
  productId: string;
  type: string;
  quantity: number;
}

interface HistoryEntry {
  id: string;
  date: string;
  status: string;
  userName: string;
  closedBy?: string | null;
}

interface Props {
  date: string;
  today: string;
  existing: DailyInventory | null;
  movements: Movement[];
  allProducts: Product[];
  isSuperAdmin: boolean;
  canReopen: boolean;
  history: HistoryEntry[];
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

/** Parser: "" o NaN → null, lo demás → número >= 0 (negativos → 0). */
function parseField(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  return n < 0 ? 0 : n;
}

/** Auto-cálculo de entrada/salida NR cuando ambas están vacías. */
function deriveAuto(expected: number, finalCount: number) {
  const diff = finalCount - expected;
  if (diff > 0)  return { autoEntry: diff,  autoExit: 0 };
  if (diff < 0)  return { autoEntry: 0,     autoExit: -diff };
  return { autoEntry: 0, autoExit: 0 };
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  history,
  currentDate,
}: {
  history: HistoryEntry[];
  currentDate: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          Historial de inventarios
          {history.length > 0 && (
            <span className="text-xs font-normal text-slate-400">({history.length})</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-200 max-h-72 overflow-y-auto divide-y divide-slate-100">
          {history.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 text-center">Sin registros anteriores</p>
          ) : (
            history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => router.push(`/inventario-diario?date=${entry.date}`)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 text-left transition-colors ${
                  entry.date === currentDate ? "bg-blue-50/60" : ""
                }`}
              >
                <span className="font-medium text-slate-700 capitalize text-left">
                  {formatDate(entry.date)}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-xs text-slate-400 hidden sm:block">
                    {entry.closedBy ?? entry.userName}
                  </span>
                  <Badge
                    className={
                      entry.status === "closed"
                        ? "bg-emerald-100 text-emerald-700 border-0 text-xs py-0"
                        : "bg-amber-100 text-amber-700 border-0 text-xs py-0"
                    }
                  >
                    {entry.status === "closed" ? "Cerrado" : "En curso"}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dialog: confirmación de productos en cero ────────────────────────────────

function ZeroCountsDialog({
  open,
  onOpenChange,
  zeroProducts,
  onConfirm,
  loading,
  label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  zeroProducts: string[];
  onConfirm: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            Productos sin existencias
          </DialogTitle>
          <DialogDescription>
            Los siguientes productos tienen conteo en <strong>cero o vacío</strong>. Si continúas, se registrarán como <strong>sin existencias (0 unidades)</strong>.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md text-sm">
          {zeroProducts.map((name) => (
            <li key={name} className="px-3 py-2 text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              {name}
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Volver y corregir
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? "Guardando..." : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View: Sin inventario (crear) ────────────────────────────────────────────

function CreateView({ date, allProducts }: { date: string; allProducts: Product[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [zeroDialog, setZeroDialog] = useState(false);
  const [pendingItems, setPendingItems] = useState<{ productId: string; initialCount: number }[]>([]);

  const byCategory = allProducts.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category?.name ?? "Sin categoría";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  function buildItems() {
    return allProducts.map((p) => ({
      productId: p.id,
      initialCount: parseFloat(counts[p.id] ?? "") || 0,
    }));
  }

  async function submitItems(items: { productId: string; initialCount: number }[]) {
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
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Error al iniciar inventario");
    }
  }

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const items = buildItems();
    const zeroNames = items
      .filter((i) => i.initialCount === 0)
      .map((i) => allProducts.find((p) => p.id === i.productId)?.name ?? i.productId);

    if (zeroNames.length > 0) {
      setPendingItems(items);
      setZeroDialog(true);
      return;
    }
    void submitItems(items);
  }

  return (
    <>
      <form onSubmit={handleStart} className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <ClipboardList className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Conteo inicial del día</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Registra las existencias físicas actuales. Los campos vacíos o en cero se registrarán como <strong>sin existencias (0 unidades)</strong>.
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
                {products.map((p) => {
                  const isEmpty = !counts[p.id] || counts[p.id] === "0" || counts[p.id] === "";
                  return (
                    <tr key={p.id} className={isEmpty ? "bg-red-50/40" : ""}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                        {formatStock(p.currentStock, p.unit)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          className={`w-28 ml-auto text-right tabular-nums ${isEmpty ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                          value={counts[p.id] ?? ""}
                          onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading ? "Guardando..." : "Iniciar inventario del día"}
        </Button>
      </form>

      <ZeroCountsDialog
        open={zeroDialog}
        onOpenChange={setZeroDialog}
        zeroProducts={pendingItems
          .filter((i) => i.initialCount === 0)
          .map((i) => allProducts.find((p) => p.id === i.productId)?.name ?? i.productId)}
        onConfirm={() => { setZeroDialog(false); void submitItems(pendingItems); }}
        loading={loading}
        label="Iniciar con ceros"
      />
    </>
  );
}

// ─── View: Inventario abierto (tabla unificada) ──────────────────────────────

function OpenView({
  inventory,
  movements,
}: {
  inventory: DailyInventory;
  movements: Movement[];
}) {
  const router = useRouter();

  // Pre-llenar con valores existentes (cuando se reabre el inventario)
  const [finalCounts, setFinalCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => i.finalCount !== null)
        .map((i) => [i.productId, String(i.finalCount)])
    )
  );
  const [unregEntries, setUnregEntries] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => i.unregisteredEntry != null && i.unregisteredEntry > 0)
        .map((i) => [i.productId, String(i.unregisteredEntry)])
    )
  );
  const [unregExits, setUnregExits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => i.unregisteredExit != null && i.unregisteredExit > 0)
        .map((i) => [i.productId, String(i.unregisteredExit)])
    )
  );

  const [loading, setLoading] = useState(false);
  const [zeroDialog, setZeroDialog] = useState(false);
  const [pendingClose, setPendingClose] = useState<
    { productId: string; finalCount: number; unregisteredEntry: number | null; unregisteredExit: number | null }[]
  >([]);

  // Mapa por producto con los cálculos en vivo
  const rows = useMemo(
    () =>
      inventory.items.map((item) => {
        const { entries, exits } = calcMovements(movements, item.productId);
        const expected = item.initialCount + entries - exits;

        const finalStr = finalCounts[item.productId] ?? "";
        const finalNum = parseField(finalStr) ?? 0;

        const entryStr = unregEntries[item.productId] ?? "";
        const exitStr  = unregExits[item.productId] ?? "";
        const entryNum = parseField(entryStr);
        const exitNum  = parseField(exitStr);

        const bothEmpty = entryNum === null && exitNum === null;
        const { autoEntry, autoExit } = deriveAuto(expected, finalNum);

        const effEntry = entryNum ?? (bothEmpty ? autoEntry : 0);
        const effExit  = exitNum  ?? (bothEmpty ? autoExit  : 0);

        // stock_final calculado y comparado con conteo real
        const calculated = item.initialCount + entries - exits + effEntry - effExit;
        const diff = finalNum - calculated;

        return {
          item,
          entries,
          exits,
          expected,
          finalNum,
          entryStr,
          exitStr,
          finalStr,
          autoEntry,
          autoExit,
          bothEmpty,
          effEntry,
          effExit,
          calculated,
          diff,
        };
      }),
    [inventory.items, movements, finalCounts, unregEntries, unregExits]
  );

  function buildItems() {
    return rows.map((r) => ({
      productId: r.item.productId,
      finalCount: parseField(r.finalStr) ?? 0,
      unregisteredEntry: parseField(r.entryStr),
      unregisteredExit:  parseField(r.exitStr),
    }));
  }

  async function submitClose(items: {
    productId: string;
    finalCount: number;
    unregisteredEntry: number | null;
    unregisteredExit: number | null;
  }[]) {
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
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Error al cerrar");
    }
  }

  function handleClose(e: React.FormEvent) {
    e.preventDefault();
    const items = buildItems();
    const zeroNames = items
      .filter((i) => i.finalCount === 0)
      .map((i) => inventory.items.find((it) => it.productId === i.productId)?.product.name ?? i.productId);

    if (zeroNames.length > 0) {
      setPendingClose(items);
      setZeroDialog(true);
      return;
    }
    void submitClose(items);
  }

  return (
    <div className="space-y-6">
      {inventory.reopenedBy ? (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
          <RefreshCw className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              Inventario reabierto por {inventory.reopenedBy}
            </p>
            {inventory.reopenReason && (
              <p className="text-xs text-orange-700 mt-0.5">Motivo: {inventory.reopenReason}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
          <ClipboardList className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Jornada en curso</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Diligencia los campos por producto. Si dejas vacíos los campos de entrada/salida no registrada, el sistema los calculará automáticamente a partir del conteo real.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleClose} className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Producto</th>
                <th className="text-right px-3 py-3 font-medium text-slate-500">Inicial</th>
                <th className="text-right px-3 py-3 font-medium text-emerald-600">+ Entradas reg.</th>
                <th className="text-right px-3 py-3 font-medium text-red-500">− Salidas reg.</th>
                <th className="text-right px-3 py-3 font-medium text-slate-700">Esperado</th>
                <th className="text-right px-3 py-3 font-medium text-emerald-700 w-32">Entrada NR</th>
                <th className="text-right px-3 py-3 font-medium text-red-600 w-32">Salida NR</th>
                <th className="text-right px-3 py-3 font-medium text-slate-800 w-32">Conteo real *</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const finalIsEmpty = r.finalStr.trim() === "" || r.finalStr === "0";
                return (
                  <tr key={r.item.id} className={finalIsEmpty ? "bg-red-50/30" : "hover:bg-slate-50"}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.item.product.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatStock(r.item.initialCount, r.item.product.unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                      {r.entries > 0 ? `+${formatStock(r.entries, r.item.product.unit)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-500">
                      {r.exits > 0 ? `−${formatStock(r.exits, r.item.product.unit)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                      {formatStock(r.expected, r.item.product.unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className="w-24 ml-auto text-right tabular-nums"
                        value={r.entryStr}
                        onChange={(e) =>
                          setUnregEntries((prev) => ({ ...prev, [r.item.productId]: e.target.value }))
                        }
                        placeholder={r.bothEmpty && r.autoEntry > 0 ? `auto ${r.autoEntry}` : "0"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className="w-24 ml-auto text-right tabular-nums"
                        value={r.exitStr}
                        onChange={(e) =>
                          setUnregExits((prev) => ({ ...prev, [r.item.productId]: e.target.value }))
                        }
                        placeholder={r.bothEmpty && r.autoExit > 0 ? `auto ${r.autoExit}` : "0"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className={`w-24 ml-auto text-right tabular-nums ${
                          finalIsEmpty ? "border-red-300 focus-visible:ring-red-400" : ""
                        }`}
                        value={r.finalStr}
                        onChange={(e) =>
                          setFinalCounts((prev) => ({ ...prev, [r.item.productId]: e.target.value }))
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

        <p className="text-xs text-slate-500">
          <strong>Entrada / Salida NR</strong>: cantidades que ocurrieron pero no fueron registradas como movimiento. Si los dejas vacíos, se calculan automáticamente a partir de la diferencia entre el conteo real y el esperado.
        </p>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading ? "Cerrando..." : "Confirmar y cerrar jornada"}
          </Button>
        </div>
      </form>

      <ZeroCountsDialog
        open={zeroDialog}
        onOpenChange={setZeroDialog}
        zeroProducts={pendingClose
          .filter((i) => i.finalCount === 0)
          .map(
            (i) =>
              inventory.items.find((it) => it.productId === i.productId)?.product.name ?? i.productId
          )}
        onConfirm={() => {
          setZeroDialog(false);
          void submitClose(pendingClose);
        }}
        loading={loading}
        label="Cerrar con ceros"
      />
    </div>
  );
}

// ─── View: Inventario cerrado (resultados) ───────────────────────────────────

function ClosedView({
  inventory,
  movements,
  canReopen,
}: {
  inventory: DailyInventory;
  movements: Movement[];
  canReopen: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reopening, setReopening] = useState(false);

  async function handleReopen() {
    if (!reason.trim()) {
      toast.error("Debes ingresar una justificación");
      return;
    }
    setReopening(true);
    const res = await fetch(`/api/daily-inventory/${inventory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen", reason: reason.trim() }),
    });
    setReopening(false);
    if (res.ok) {
      toast.success("Inventario reabierto");
      setDialogOpen(false);
      router.refresh();
    } else {
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Error al reabrir");
    }
  }

  const rows = inventory.items.map((item) => {
    const { entries, exits } = calcMovements(movements, item.productId);
    const expected = item.initialCount + entries - exits;
    const unregEntry = item.unregisteredEntry ?? 0;
    const unregExit  = item.unregisteredExit  ?? 0;
    const finalCount = item.finalCount ?? 0;
    const calculated = expected + unregEntry - unregExit;
    const diff = finalCount - calculated;
    return { item, entries, exits, expected, unregEntry, unregExit, finalCount, calculated, diff };
  });

  const hasDiscrepancies = rows.some((r) => Math.abs(r.diff) > 0.001);
  const hasUnregistered  = rows.some((r) => r.unregEntry > 0 || r.unregExit > 0);

  return (
    <div className="space-y-6">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Jornada cerrada</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Cerrado por {inventory.closedBy ?? "—"}.{" "}
              {hasDiscrepancies
                ? "Se encontraron diferencias. Revisa los detalles abajo."
                : hasUnregistered
                ? "Se registraron movimientos no registrados."
                : "Todo coincide correctamente."}
            </p>
          </div>
        </div>
        {canReopen && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setReason(""); setDialogOpen(true); }}
            className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Reabrir
          </Button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Producto</th>
              <th className="text-right px-3 py-3 font-medium text-slate-500">Inicial</th>
              <th className="text-right px-3 py-3 font-medium text-emerald-600">Entradas</th>
              <th className="text-right px-3 py-3 font-medium text-red-500">Salidas</th>
              <th className="text-right px-3 py-3 font-medium text-emerald-700">Entrada NR</th>
              <th className="text-right px-3 py-3 font-medium text-red-600">Salida NR</th>
              <th className="text-right px-3 py-3 font-medium text-slate-600">Esperado</th>
              <th className="text-right px-3 py-3 font-medium text-slate-800">Conteo final</th>
              <th className="text-center px-3 py-3 font-medium text-slate-500">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const hasGap = Math.abs(r.diff) > 0.001;
              return (
                <tr key={r.item.id} className={hasGap ? "bg-amber-50/50" : ""}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.item.product.name}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                    {formatStock(r.item.initialCount, r.item.product.unit)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600">
                    {r.entries > 0 ? `+${formatStock(r.entries, r.item.product.unit)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-red-500">
                    {r.exits > 0 ? `−${formatStock(r.exits, r.item.product.unit)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                    {r.unregEntry > 0 ? `+${formatStock(r.unregEntry, r.item.product.unit)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-red-600">
                    {r.unregExit > 0 ? `−${formatStock(r.unregExit, r.item.product.unit)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                    {formatStock(r.expected, r.item.product.unit)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800">
                    {formatStock(r.finalCount, r.item.product.unit)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {!hasGap ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <Minus className="w-3 h-3" /> Sin diferencia
                      </span>
                    ) : r.diff > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium">
                        <TrendingUp className="w-3 h-3" />
                        +{formatStock(r.diff, r.item.product.unit)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                        <TrendingDown className="w-3 h-3" />
                        {formatStock(r.diff, r.item.product.unit)}
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
            <p className="text-sm font-semibold text-amber-800">Quedaron diferencias residuales</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Después de aplicar las entradas y salidas no registradas, el conteo real todavía no coincide con el stock calculado.
            </p>
          </div>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => { if (!reopening) setDialogOpen(open); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-orange-600" />
              Reabrir inventario
            </DialogTitle>
            <DialogDescription>
              Los valores registrados se conservarán para que puedan modificarse. Esta acción quedará registrada con tu nombre.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="reopen-reason" className="text-sm font-medium text-slate-700">
                Justificación <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reopen-reason"
                placeholder="Ej: Error en el conteo final de Coca Cola, se debe corregir el valor..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
                disabled={reopening}
              />
              <p className="text-xs text-slate-500">Esta nota quedará guardada en el registro del inventario.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={reopening}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReopen}
              disabled={reopening || !reason.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${reopening ? "animate-spin" : ""}`} />
              {reopening ? "Reabriendo..." : "Confirmar reapertura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Root Component ──────────────────────────────────────────────────────────

export function DailyInventoryClient({
  date,
  today,
  existing,
  movements,
  allProducts,
  canReopen,
  history,
}: Props) {
  const router = useRouter();
  const isToday = date === today;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario Diario</h1>
          <p className="text-slate-500 text-sm mt-1 capitalize">{formatDate(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/inventario-diario")}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
              Ir a hoy
            </Button>
          )}
          {existing && (
            <Badge
              className={
                existing.status === "closed"
                  ? "bg-emerald-100 text-emerald-700 border-0"
                  : "bg-amber-100 text-amber-700 border-0"
              }
            >
              {existing.status === "closed" ? "Cerrado" : "En curso"}
            </Badge>
          )}
        </div>
      </div>

      <HistoryPanel history={history} currentDate={date} />

      {!existing ? (
        isToday ? (
          <CreateView date={date} allProducts={allProducts} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <p className="text-slate-500 text-sm">No hay inventario registrado para esta fecha.</p>
          </div>
        )
      ) : existing.status === "open" ? (
        <OpenView inventory={existing} movements={movements} />
      ) : (
        <ClosedView inventory={existing} movements={movements} canReopen={canReopen} />
      )}
    </div>
  );
}
