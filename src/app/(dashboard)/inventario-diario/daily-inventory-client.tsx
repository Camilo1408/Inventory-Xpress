"use client";

import { useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { BottleLevelSelector, ReserveCounter, BottleLevelBadge, ShotsCopeoToggle, ShotsCopeoBadge } from "@/components/inventario/bottle-level-selector";
import { isBottleTrackedSlug, isBottleLevel, isShotsCopeoTrackedSlug, emptyOpenBottle, type BottleLevel } from "@/lib/bottle";
import { sanitizeNumericInput, parseNumericValue, numericFieldProps } from "@/lib/numeric";
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  History,
  ChevronDown,
  ChevronLeft,
  CalendarDays,
  Ban,
  Pencil,
  Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  category: { name: string; slug: string | null } | null;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
  shotsCopeo?: boolean;
}

interface InventoryItem {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string; currentStock: number; bottleLevel?: string | null; reserveBottles?: number | null; shotsCopeo?: boolean; category?: { name: string; slug: string | null } | null };
  initialCount: number;
  finalCount: number | null;
  unregisteredEntry: number | null;
  unregisteredExit: number | null;
  unregEntryReason?: string | null;
  unregEntryTime?: string | null;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
  shotsCopeo?: boolean;
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

interface InventoryCategory {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  date: string;
  today: string;
  existing: DailyInventory | null;
  movements: Movement[];
  allProducts: Product[];
  category: InventoryCategory;
  canOpen: boolean;
  canClose: boolean;
  canReopen: boolean;
  canManageOpen: boolean;
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

/** Parser: "" o NaN → null, lo demás → número >= 0 (negativos → 0). Admite fracciones ("1/2", "7 1/2"). */
function parseField(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = parseNumericValue(value);
  if (isNaN(n)) return null;
  return n < 0 ? 0 : n;
}

/** ¿El producto/item se controla por nivel de botella (subcategoría Cócteles)? */
function productIsBottle(p: { category?: { slug: string | null } | null }): boolean {
  return isBottleTrackedSlug(p.category?.slug ?? null);
}

/** Nombre de categoría para agrupar tarjetas, con fallback para productos sin categoría. */
function categoryName(p: { category?: { name: string } | null }): string {
  return p.category?.name ?? "Sin categoría";
}

/** Agrupa una lista en tarjetas por categoría preservando el orden de entrada
 *  (las listas ya llegan ordenadas por categoría → nombre desde el servidor). */
function groupByCategory<T>(list: T[], getCategory: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const cat = getCategory(item);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return Array.from(map.entries());
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  history,
  currentDate,
  categorySlug,
}: {
  history: HistoryEntry[];
  currentDate: string;
  categorySlug: string;
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
                onClick={() => router.push(`/inventario-diario?categoria=${categorySlug}&date=${entry.date}`)}
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

// ─── Dialog: confirmación de diferencias con el inventario anterior ───────────

interface DiscRow {
  productId: string;
  name: string;
  unit: string;
  system: number;
  counted: number;
  diff: number;
}

function DiscrepancyDialog({
  open,
  onOpenChange,
  rows,
  notes,
  setNotes,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: DiscRow[];
  notes: Record<string, string>;
  setNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            Diferencias con el inventario anterior
          </DialogTitle>
          <DialogDescription>
            El conteo inicial de estos productos no coincide con el stock del sistema. Si confirmas,
            el stock se ajustará al valor contado y quedará un movimiento de corrección en el
            historial global. Puedes dejar una nota opcional con el motivo.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto space-y-3">
          {rows.map((r) => (
            <div key={r.productId} className="border border-slate-200 rounded-md p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-1 sm:gap-2">
                <span className="font-medium text-slate-800">{r.name}</span>
                <span className="tabular-nums text-xs flex flex-wrap items-center gap-x-1">
                  <span className="text-slate-500">Sistema {formatStock(r.system, r.unit)}</span>
                  <span className="text-slate-300">→</span>
                  <span className="font-semibold text-slate-800">Contado {formatStock(r.counted, r.unit)}</span>
                  <span className={`ml-1 font-medium ${r.diff > 0 ? "text-blue-600" : "text-red-600"}`}>
                    ({r.diff > 0 ? "+" : ""}{formatStock(r.diff, r.unit)})
                  </span>
                </span>
              </div>
              <Input
                type="text"
                placeholder="Nota opcional (motivo de la corrección)"
                value={notes[r.productId] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [r.productId]: e.target.value }))}
                className="text-sm"
                disabled={loading}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Volver y revisar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? "Guardando..." : "Confirmar y ajustar stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View: Sin inventario (crear) ────────────────────────────────────────────

interface StartItem {
  productId: string;
  initialCount: number;
  note?: string;
  bottleLevel?: BottleLevel | null;
  reserveBottles?: number | null;
  shotsCopeo?: boolean;
}

function CreateView({ date, allProducts, category }: { date: string; allProducts: Product[]; category: InventoryCategory }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [zeroDialog, setZeroDialog] = useState(false);
  const [pendingItems, setPendingItems] = useState<StartItem[]>([]);
  const [discDialog, setDiscDialog] = useState(false);
  const [discRows, setDiscRows] = useState<DiscRow[]>([]);
  const [discNotes, setDiscNotes] = useState<Record<string, string>>({});

  const [levels, setLevels] = useState<Record<string, BottleLevel>>(() =>
    Object.fromEntries(
      allProducts
        .filter((p) => productIsBottle(p) && isBottleLevel(p.bottleLevel))
        .map((p) => [p.id, p.bottleLevel as BottleLevel])
    )
  );
  const [reserves, setReserves] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      allProducts.filter((p) => productIsBottle(p)).map((p) => [p.id, p.reserveBottles ?? 0])
    )
  );
  // Indicador shots/copeo — solo Licores y Vinos (productos numéricos, no botella).
  const [shotsCopeoFlags, setShotsCopeoFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      allProducts
        .filter((p) => isShotsCopeoTrackedSlug(p.category?.slug))
        .map((p) => [p.id, !!p.shotsCopeo])
    )
  );

  function keepSameBottles() {
    const nextLevels: Record<string, BottleLevel> = {};
    const nextReserves: Record<string, number> = {};
    for (const p of allProducts) {
      if (!productIsBottle(p)) continue;
      if (isBottleLevel(p.bottleLevel)) nextLevels[p.id] = p.bottleLevel as BottleLevel;
      nextReserves[p.id] = p.reserveBottles ?? 0;
    }
    setLevels(nextLevels);
    setReserves(nextReserves);
    toast.success("Niveles copiados del último registro");
  }

  // Copia el cierre de ayer completo como conteo inicial de hoy: para productos
  // numéricos, el stock del sistema (= conteo final de ayer, si no hubo
  // movimientos desde entonces) pasa a ser el conteo inicial; para botellas,
  // mismo comportamiento que keepSameBottles.
  function keepSameAsYesterday() {
    const nextCounts: Record<string, string> = {};
    const nextLevels: Record<string, BottleLevel> = {};
    const nextReserves: Record<string, number> = {};
    for (const p of allProducts) {
      if (productIsBottle(p)) {
        if (isBottleLevel(p.bottleLevel)) nextLevels[p.id] = p.bottleLevel as BottleLevel;
        nextReserves[p.id] = p.reserveBottles ?? 0;
      } else {
        nextCounts[p.id] = String(p.currentStock);
      }
    }
    setCounts(nextCounts);
    setLevels(nextLevels);
    setReserves(nextReserves);
    toast.success("Conteo inicial copiado del cierre de ayer");
  }

  const byCategory = allProducts.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category?.name ?? "Sin categoría";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  function buildItems(): StartItem[] {
    return allProducts.map((p) => {
      if (productIsBottle(p)) {
        return {
          productId: p.id,
          initialCount: 0,
          bottleLevel: levels[p.id] ?? null,
          reserveBottles: reserves[p.id] ?? 0,
        };
      }
      return {
        productId: p.id,
        initialCount: parseNumericValue(counts[p.id]) || 0,
        shotsCopeo: isShotsCopeoTrackedSlug(p.category?.slug) ? (shotsCopeoFlags[p.id] ?? false) : undefined,
      };
    });
  }

  async function submitItems(items: StartItem[]) {
    setLoading(true);
    const res = await fetch("/api/daily-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, categoryId: category.id, items }),
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

  // Detecta productos cuyo conteo inicial difiere del stock del sistema.
  function computeDiscRows(items: StartItem[]): DiscRow[] {
    return items
      .map((i) => {
        const p = allProducts.find((pr) => pr.id === i.productId);
        if (!p || productIsBottle(p)) return null;
        const diff = i.initialCount - p.currentStock;
        if (Math.abs(diff) <= 0.001) return null;
        return {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          system: p.currentStock,
          counted: i.initialCount,
          diff,
        } satisfies DiscRow;
      })
      .filter((r): r is DiscRow => r !== null);
  }

  // Tras pasar el control de ceros, revisa discrepancias antes de enviar.
  function proceedToDiscCheck(items: StartItem[]) {
    const rows = computeDiscRows(items);
    if (rows.length > 0) {
      setPendingItems(items);
      setDiscRows(rows);
      setDiscDialog(true);
      return;
    }
    void submitItems(items);
  }

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const items = buildItems();
    const zeroNames = items
      .filter((i) => {
        const p = allProducts.find((pr) => pr.id === i.productId);
        return p && !productIsBottle(p) && i.initialCount === 0;
      })
      .map((i) => allProducts.find((p) => p.id === i.productId)?.name ?? i.productId);

    if (zeroNames.length > 0) {
      setPendingItems(items);
      setZeroDialog(true);
      return;
    }
    proceedToDiscCheck(items);
  }

  return (
    <>
      <form onSubmit={handleStart} className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
          <div className="flex gap-3">
            <ClipboardList className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Conteo inicial del día</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Registra las existencias físicas actuales. Los campos vacíos o en cero se registrarán como <strong>sin existencias (0 unidades)</strong>.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 bg-white"
            onClick={keepSameAsYesterday}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Mantener igual al cierre de ayer
          </Button>
        </div>

        {Object.entries(byCategory).map(([cat, products]) => (
          <div key={cat} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat}</span>
              {products.every(productIsBottle) && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={keepSameBottles}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Mantener igual
                </Button>
              )}
            </div>
            {products.every(productIsBottle) ? (
              <div className="divide-y divide-slate-100">
                {products.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <BottleLevelSelector
                          value={levels[p.id] ?? null}
                          onChange={(v) => setLevels((prev) => ({ ...prev, [p.id]: v }))}
                        />
                        {/* Vaciar: si hay reserva destapa una nueva (reserva −1, Llena). */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = emptyOpenBottle(reserves[p.id] ?? 0);
                            setReserves((prev) => ({ ...prev, [p.id]: next.reserve }));
                            setLevels((prev) => {
                              const m = { ...prev };
                              if (next.level === null) delete m[p.id];
                              else m[p.id] = next.level;
                              return m;
                            });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Vaciar
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Reserva</span>
                        <ReserveCounter
                          value={reserves[p.id] ?? 0}
                          onChange={(v) => setReserves((prev) => ({ ...prev, [p.id]: v }))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Móvil: fila por producto apilada, sin scroll lateral */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {products.map((p) => {
                    const isEmpty = !counts[p.id] || counts[p.id] === "0" || counts[p.id] === "";
                    return (
                      <div
                        key={p.id}
                        className={`px-4 py-3 flex items-center justify-between gap-3 ${isEmpty ? "bg-red-50/40" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-sm truncate flex items-center gap-1.5">
                            <span className="truncate">{p.name}</span>
                            {isShotsCopeoTrackedSlug(p.category?.slug) && (
                              <ShotsCopeoToggle
                                value={shotsCopeoFlags[p.id] ?? false}
                                onChange={(v) => setShotsCopeoFlags((prev) => ({ ...prev, [p.id]: v }))}
                              />
                            )}
                          </p>
                          <p className="text-xs text-slate-400 tabular-nums">
                            Sistema: {formatStock(p.currentStock, p.unit)}
                          </p>
                        </div>
                        <Input
                          {...numericFieldProps}
                          className={`w-24 shrink-0 text-right tabular-nums ${isEmpty ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                          value={counts[p.id] ?? ""}
                          onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: sanitizeNumericInput(e.target.value) }))}
                          placeholder="0"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Escritorio: tabla */}
                <table className="hidden sm:table w-full text-sm">
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
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span>{p.name}</span>
                              {isShotsCopeoTrackedSlug(p.category?.slug) && (
                                <ShotsCopeoToggle
                                  value={shotsCopeoFlags[p.id] ?? false}
                                  onChange={(v) => setShotsCopeoFlags((prev) => ({ ...prev, [p.id]: v }))}
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                            {formatStock(p.currentStock, p.unit)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Input
                              {...numericFieldProps}
                              className={`w-28 ml-auto text-right tabular-nums ${isEmpty ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                              value={counts[p.id] ?? ""}
                              onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: sanitizeNumericInput(e.target.value) }))}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
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
        onConfirm={() => { setZeroDialog(false); proceedToDiscCheck(pendingItems); }}
        loading={loading}
        label="Iniciar con ceros"
      />

      <DiscrepancyDialog
        open={discDialog}
        onOpenChange={setDiscDialog}
        rows={discRows}
        notes={discNotes}
        setNotes={setDiscNotes}
        onConfirm={() => {
          const withNotes = pendingItems.map((i) => {
            const note = discNotes[i.productId]?.trim();
            return note ? { ...i, note } : i;
          });
          setDiscDialog(false);
          void submitItems(withNotes);
        }}
        loading={loading}
      />
    </>
  );
}

// ─── Dialog: confirmación de cierre de jornada ────────────────────────────────

interface AutoRow {
  name: string;
  qty: number;
  unit: string;
}

interface CloseItem {
  productId: string;
  finalCount: number;
  unregisteredEntry: number | null;
  unregisteredExit: number | null;
  entryReason: string | null;
  entryTime: string | null;
  bottleLevel: BottleLevel | null;
  reserveBottles: number | null;
  shotsCopeo?: boolean;
}

/** Producto con entrada no registrada que requiere justificación (motivo + hora). */
interface EntryJustifyRow {
  productId: string;
  name: string;
  qty: number;
  unit: string;
}

function CloseConfirmDialog({
  open,
  onOpenChange,
  autoExits,
  entries,
  zeros,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  autoExits: AutoRow[];
  entries: EntryJustifyRow[];
  zeros: string[];
  onConfirm: () => void;
  loading: boolean;
}) {
  const noChanges = autoExits.length === 0 && entries.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Confirmar cierre de jornada
          </DialogTitle>
          <DialogDescription>
            Verifica que los conteos sean correctos. Al confirmar se registrará el inventario y el
            stock de cada producto quedará igual al conteo real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          {entries.length > 0 && (
            <div className="rounded-md border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="font-medium text-emerald-700 mb-1.5 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Entradas no registradas
              </p>
              <ul className="space-y-0.5 text-slate-600">
                {entries.map((r) => (
                  <li key={r.productId} className="flex justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="tabular-nums font-medium text-emerald-600">+{formatStock(r.qty, r.unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {autoExits.length > 0 && (
            <div className="rounded-md border border-red-100 bg-red-50/60 p-3">
              <p className="font-medium text-red-700 mb-1.5 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Se calcularán salidas automáticamente
              </p>
              <ul className="space-y-0.5 text-slate-600">
                {autoExits.map((r) => (
                  <li key={r.name} className="flex justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="tabular-nums font-medium text-red-600">−{formatStock(r.qty, r.unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {zeros.length > 0 && (
            <div className="rounded-md border border-amber-100 bg-amber-50/60 p-3">
              <p className="font-medium text-amber-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Productos registrados sin existencias
              </p>
              <p className="text-xs text-slate-600">{zeros.join(", ")}</p>
            </div>
          )}

          {noChanges && zeros.length === 0 && (
            <p className="text-slate-500">Los conteos coinciden con el stock esperado.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Volver y revisar
          </Button>
          <Button onClick={onConfirm} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading ? "Cerrando..." : "Confirmar y cerrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View: Inventario abierto (tabla unificada) ──────────────────────────────

function OpenView({
  inventory,
  movements,
  category,
  canClose,
  canManageOpen,
  allProducts,
}: {
  inventory: DailyInventory;
  movements: Movement[];
  category: InventoryCategory;
  canClose: boolean;
  canManageOpen: boolean;
  allProducts: Product[];
}) {
  const router = useRouter();

  // Productos numéricos activos de la categoría, en el orden establecido
  // (categoría → nombre). Incluye productos creados DESPUÉS de abrir la jornada,
  // que aún no son ítems: por eso el diálogo de conteo inicial se arma desde aquí
  // y no desde inventory.items.
  const numericCategoryProducts = useMemo(
    () => allProducts.filter((p) => !productIsBottle(p)),
    [allProducts]
  );
  const itemProductIds = useMemo(
    () => new Set(inventory.items.map((i) => i.productId)),
    [inventory.items]
  );

  // ── Descartar jornada abierta (PROPRIETARY/SUPERADMIN) ────────────────────
  const [discardDialog, setDiscardDialog] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [discarding, setDiscarding] = useState(false);

  async function handleDiscard() {
    if (!discardReason.trim()) {
      toast.error("Debes ingresar una justificación");
      return;
    }
    setDiscarding(true);
    const res = await fetch(`/api/daily-inventory/${inventory.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: discardReason.trim() }),
    });
    setDiscarding(false);
    if (res.ok) {
      toast.success("Jornada descartada");
      setDiscardDialog(false);
      router.push(`/inventario-diario?categoria=${category.slug}`);
      router.refresh();
    } else {
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Error al descartar la jornada");
    }
  }

  // ── Editar conteo inicial de una jornada abierta (PROPRIETARY/SUPERADMIN) ─
  const [editInitialDialog, setEditInitialDialog] = useState(false);
  const [editInitialCounts, setEditInitialCounts] = useState<Record<string, string>>({});
  const [savingInitial, setSavingInitial] = useState(false);

  function openEditInitial() {
    const initialByProduct = new Map(
      inventory.items.filter((i) => !productIsBottle(i.product)).map((i) => [i.productId, i.initialCount])
    );
    setEditInitialCounts(
      Object.fromEntries(
        numericCategoryProducts.map((p) => {
          // Producto ya en la jornada → su conteo inicial; producto nuevo → su
          // stock actual como valor de partida editable.
          const existing = initialByProduct.get(p.id);
          return [p.id, String(existing ?? p.currentStock)];
        })
      )
    );
    setEditInitialDialog(true);
  }

  async function handleSaveInitial() {
    const initialCounts = Object.entries(editInitialCounts)
      .map(([productId, v]) => ({ productId, initialCount: parseField(v) ?? 0 }))
      .filter((ic) => ic.initialCount >= 0);
    setSavingInitial(true);
    const res = await fetch(`/api/daily-inventory/${inventory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "editInitial", initialCounts }),
    });
    setSavingInitial(false);
    if (res.ok) {
      toast.success("Conteo inicial corregido");
      setEditInitialDialog(false);
      router.refresh();
    } else {
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Error al corregir el conteo inicial");
    }
  }

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

  // Justificación de entradas no registradas: motivo y hora de ingreso (precargados al reabrir).
  const [entryReasons, setEntryReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      inventory.items.filter((i) => i.unregEntryReason).map((i) => [i.productId, i.unregEntryReason as string])
    )
  );
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      inventory.items.filter((i) => i.unregEntryTime).map((i) => [i.productId, i.unregEntryTime as string])
    )
  );

  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [pendingClose, setPendingClose] = useState<CloseItem[]>([]);

  const bottleItems = useMemo(() => inventory.items.filter((i) => productIsBottle(i.product)), [inventory.items]);
  const numericItems = useMemo(() => inventory.items.filter((i) => !productIsBottle(i.product)), [inventory.items]);

  const [bottleLevels, setBottleLevels] = useState<Record<string, BottleLevel>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => productIsBottle(i.product))
        .map((i) => {
          const lvl = isBottleLevel(i.bottleLevel) ? i.bottleLevel : (isBottleLevel(i.product.bottleLevel) ? i.product.bottleLevel : null);
          return [i.productId, lvl];
        })
        .filter((e): e is [string, BottleLevel] => e[1] !== null)
    )
  );
  const [bottleReserves, setBottleReserves] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => productIsBottle(i.product))
        .map((i) => [i.productId, i.reserveBottles ?? i.product.reserveBottles ?? 0])
    )
  );
  // Indicador shots/copeo — solo Licores y Vinos (ítems numéricos, no botella).
  // Precedencia: valor del ítem (fijado al abrir o en un cierre previo) y si no,
  // el valor actual del producto.
  const [shotsCopeoFlags, setShotsCopeoFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => isShotsCopeoTrackedSlug(i.product.category?.slug))
        .map((i) => [i.productId, i.shotsCopeo ?? i.product.shotsCopeo ?? false])
    )
  );

  function keepSameBottles() {
    const nextLevels: Record<string, BottleLevel> = {};
    const nextReserves: Record<string, number> = {};
    for (const i of bottleItems) {
      const lvl = isBottleLevel(i.product.bottleLevel) ? i.product.bottleLevel as BottleLevel : (isBottleLevel(i.bottleLevel) ? i.bottleLevel as BottleLevel : null);
      if (lvl) nextLevels[i.productId] = lvl;
      nextReserves[i.productId] = i.product.reserveBottles ?? i.reserveBottles ?? 0;
    }
    setBottleLevels(nextLevels);
    setBottleReserves(nextReserves);
    toast.success("Niveles copiados del último registro");
  }

  // Mapa por producto con los cálculos en vivo (solo ítems numéricos)
  const rows = useMemo(
    () =>
      numericItems.map((item) => {
        const { entries, exits } = calcMovements(movements, item.productId);
        const expected = item.initialCount + entries - exits;

        const finalStr = finalCounts[item.productId] ?? "";
        const finalEntered = finalStr.trim() !== "";
        const finalNum = parseField(finalStr) ?? 0;

        const entryStr = unregEntries[item.productId] ?? "";
        const exitStr  = unregExits[item.productId] ?? "";
        const entryNum = parseField(entryStr);
        const exitNum  = parseField(exitStr);

        const manualEntry = entryNum ?? 0;
        const manualExit  = exitNum  ?? 0;

        // Diferencia que falta explicar tras aplicar las NR manuales (solo si ya
        // se ingresó el conteo real). El lado que el usuario NO ingresó la absorbe:
        // sobrante → entrada NR, faltante → salida NR. Así nunca queda residual.
        const gap = finalEntered ? finalNum - (expected + manualEntry - manualExit) : 0;
        const autoEntry = entryNum === null && gap > 0 ? gap : 0;
        const autoExit  = exitNum  === null && gap < 0 ? -gap : 0;

        const effEntry = entryNum ?? autoEntry;
        const effExit  = exitNum  ?? autoExit;

        // Esperado en vivo = inicial + entradas (reg + NR) − salidas (reg + NR).
        const calculated = item.initialCount + entries - exits + effEntry - effExit;
        const diff = finalNum - calculated;

        return {
          item,
          entries,
          exits,
          expected,
          finalNum,
          finalEntered,
          entryStr,
          exitStr,
          finalStr,
          autoEntry,
          autoExit,
          effEntry,
          effExit,
          calculated,
          diff,
        };
      }),
    [numericItems, movements, finalCounts, unregEntries, unregExits]
  );

  // Categorías en el mismo orden del conteo inicial (categoría → nombre), cada
  // una como su propia tarjeta — igual que en la vista de apertura.
  const categoryCards = useMemo(() => {
    const rowsByProduct = new Map(rows.map((r) => [r.item.productId, r]));
    const bottleByProduct = new Map(bottleItems.map((i) => [i.productId, i]));
    return groupByCategory(inventory.items, (i) => categoryName(i.product)).map(([name, items]) => ({
      name,
      isBottle: productIsBottle(items[0].product),
      rows: items.map((i) => rowsByProduct.get(i.productId)).filter((r): r is (typeof rows)[number] => !!r),
      bottleItems: items.map((i) => bottleByProduct.get(i.productId)).filter((i): i is (typeof bottleItems)[number] => !!i),
    }));
  }, [inventory.items, rows, bottleItems]);

  function buildItems(): CloseItem[] {
    const numeric: CloseItem[] = rows.map((r) => ({
      productId: r.item.productId,
      finalCount: parseField(r.finalStr) ?? 0,
      unregisteredEntry: parseField(r.entryStr),
      unregisteredExit:  parseField(r.exitStr),
      entryReason: r.effEntry > 0 ? (entryReasons[r.item.productId]?.trim() || null) : null,
      entryTime:   r.effEntry > 0 ? (entryTimes[r.item.productId]?.trim() || null) : null,
      bottleLevel: null,
      reserveBottles: null,
      shotsCopeo: isShotsCopeoTrackedSlug(r.item.product.category?.slug) ? (shotsCopeoFlags[r.item.productId] ?? false) : undefined,
    }));
    const bottles: CloseItem[] = bottleItems.map((i) => ({
      productId: i.productId,
      finalCount: 0,
      unregisteredEntry: null,
      unregisteredExit: null,
      entryReason: null,
      entryTime: null,
      bottleLevel: bottleLevels[i.productId] ?? null,
      reserveBottles: bottleReserves[i.productId] ?? 0,
    }));
    return [...numeric, ...bottles];
  }

  async function submitClose(items: CloseItem[]) {
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
    // Toda entrada no registrada exige motivo y hora antes de cerrar.
    const missing = rows.find(
      (r) =>
        r.effEntry > 0 &&
        ((entryReasons[r.item.productId]?.trim() ?? "") === "" || (entryTimes[r.item.productId]?.trim() ?? "") === "")
    );
    if (missing) {
      toast.error(`Justifica la entrada no registrada de ${missing.item.product.name}: motivo y hora de ingreso.`);
      return;
    }
    setPendingClose(buildItems());
    setConfirmDialog(true);
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

      {canManageOpen && (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Button type="button" size="sm" variant="outline" onClick={openEditInitial}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Editar conteo inicial
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { setDiscardReason(""); setDiscardDialog(true); }}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Descartar jornada
          </Button>
        </div>
      )}

      <form onSubmit={handleClose} className="space-y-4">
        {categoryCards.map((cat) => cat.isBottle ? (
          <div key={cat.name} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat.name} · nivel de botella</span>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={keepSameBottles}>
                <RefreshCw className="w-3 h-3 mr-1" /> Mantener igual
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {cat.bottleItems.map((i) => (
                <div key={i.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <span className="font-medium text-slate-800 text-sm">{i.product.name}</span>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <BottleLevelSelector
                        value={bottleLevels[i.productId] ?? null}
                        onChange={(v) => setBottleLevels((prev) => ({ ...prev, [i.productId]: v }))}
                      />
                      {/* Vaciar: si hay reserva destapa una nueva (reserva −1, Llena). */}
                      <button
                        type="button"
                        onClick={() => {
                          const next = emptyOpenBottle(bottleReserves[i.productId] ?? 0);
                          setBottleReserves((prev) => ({ ...prev, [i.productId]: next.reserve }));
                          setBottleLevels((prev) => {
                            const m = { ...prev };
                            if (next.level === null) delete m[i.productId];
                            else m[i.productId] = next.level;
                            return m;
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Vaciar
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Reserva</span>
                      <ReserveCounter
                        value={bottleReserves[i.productId] ?? 0}
                        onChange={(v) => setBottleReserves((prev) => ({ ...prev, [i.productId]: v }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div key={cat.name} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat.name}</span>
          </div>

          {/* Móvil: una tarjeta por producto (evita la tabla de 8 columnas con scroll) */}
          <div className="lg:hidden p-3 space-y-3">
          {cat.rows.map((r) => {
            const finalIsEmpty = r.finalStr.trim() === "" || r.finalStr === "0";
            const unit = r.item.product.unit;
            return (
              <div
                key={r.item.id}
                className={`rounded-xl border p-4 ${finalIsEmpty ? "border-red-200 bg-red-50/30" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-medium text-slate-800 flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{r.item.product.name}</span>
                    {isShotsCopeoTrackedSlug(r.item.product.category?.slug) && (
                      <ShotsCopeoToggle
                        value={shotsCopeoFlags[r.item.productId] ?? false}
                        onChange={(v) => setShotsCopeoFlags((prev) => ({ ...prev, [r.item.productId]: v }))}
                      />
                    )}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{unit}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
                  <span className="text-slate-500">
                    Inicial <strong className="text-slate-700 tabular-nums">{formatStock(r.item.initialCount, unit)}</strong>
                  </span>
                  <span className="text-emerald-600 tabular-nums">
                    {r.entries > 0 ? `+${formatStock(r.entries, unit)} ent.` : "sin entradas"}
                  </span>
                  <span className="text-red-500 tabular-nums">
                    {r.exits > 0 ? `−${formatStock(r.exits, unit)} sal.` : "sin salidas"}
                  </span>
                  <span className="text-slate-500">
                    Esperado <strong className="text-slate-800 tabular-nums">{formatStock(r.calculated, unit)}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-emerald-700 mb-1">Entrada NR</label>
                    <Input
                      {...numericFieldProps}
                      className="w-full text-right tabular-nums"
                      value={r.entryStr}
                      onChange={(e) =>
                        setUnregEntries((prev) => ({ ...prev, [r.item.productId]: sanitizeNumericInput(e.target.value) }))
                      }
                      placeholder={r.autoEntry > 0 ? `auto ${r.autoEntry}` : "0"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-red-600 mb-1">Salida NR</label>
                    <Input
                      {...numericFieldProps}
                      className="w-full text-right tabular-nums"
                      value={r.exitStr}
                      onChange={(e) =>
                        setUnregExits((prev) => ({ ...prev, [r.item.productId]: sanitizeNumericInput(e.target.value) }))
                      }
                      placeholder={r.autoExit > 0 ? `auto ${r.autoExit}` : "0"}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-800 mb-1">Conteo real *</label>
                  <Input
                    {...numericFieldProps}
                    className={`w-full text-right tabular-nums ${finalIsEmpty ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                    value={r.finalStr}
                    onChange={(e) =>
                      setFinalCounts((prev) => ({ ...prev, [r.item.productId]: sanitizeNumericInput(e.target.value) }))
                    }
                    placeholder="0"
                  />
                </div>
                {r.effEntry > 0 && (
                  <div className="mt-3 rounded-md bg-emerald-50/60 p-2.5 space-y-2">
                    <span className="block text-xs font-medium text-emerald-700">
                      Justifica la entrada NR (+{formatStock(r.effEntry, unit)}):
                    </span>
                    <Input
                      type="text"
                      placeholder="Motivo (por qué no se registró)"
                      value={entryReasons[r.item.productId] ?? ""}
                      onChange={(ev) => setEntryReasons((p) => ({ ...p, [r.item.productId]: ev.target.value }))}
                      className="text-sm w-full"
                    />
                    <Input
                      type="time"
                      value={entryTimes[r.item.productId] ?? ""}
                      onChange={(ev) => setEntryTimes((p) => ({ ...p, [r.item.productId]: ev.target.value }))}
                      className="text-sm w-full"
                    />
                  </div>
                )}
              </div>
            );
          })}
          </div>

          {/* Escritorio: tabla completa */}
          <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Producto</th>
                <th className="text-right px-3 py-3 font-medium text-slate-500">Inicial</th>
                <th className="text-right px-3 py-3 font-medium text-emerald-600">+ Entradas reg.</th>
                <th className="text-right px-3 py-3 font-medium text-red-500">− Salidas reg.</th>
                <th className="text-right px-3 py-3 font-medium text-emerald-700 w-32">Entrada NR</th>
                <th className="text-right px-3 py-3 font-medium text-red-600 w-32">Salida NR</th>
                <th className="text-right px-3 py-3 font-medium text-slate-700">Esperado</th>
                <th className="text-right px-3 py-3 font-medium text-slate-800 w-32">Conteo real *</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cat.rows.map((r) => {
                const finalIsEmpty = r.finalStr.trim() === "" || r.finalStr === "0";
                return (
                  <Fragment key={r.item.id}>
                    <tr className={finalIsEmpty ? "bg-red-50/30" : "hover:bg-slate-50"}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>{r.item.product.name}</span>
                        {isShotsCopeoTrackedSlug(r.item.product.category?.slug) && (
                          <ShotsCopeoToggle
                            value={shotsCopeoFlags[r.item.productId] ?? false}
                            onChange={(v) => setShotsCopeoFlags((prev) => ({ ...prev, [r.item.productId]: v }))}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatStock(r.item.initialCount, r.item.product.unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                      {r.entries > 0 ? `+${formatStock(r.entries, r.item.product.unit)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-500">
                      {r.exits > 0 ? `−${formatStock(r.exits, r.item.product.unit)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        {...numericFieldProps}
                        className="w-24 ml-auto text-right tabular-nums"
                        value={r.entryStr}
                        onChange={(e) =>
                          setUnregEntries((prev) => ({ ...prev, [r.item.productId]: sanitizeNumericInput(e.target.value) }))
                        }
                        placeholder={r.autoEntry > 0 ? `auto ${r.autoEntry}` : "0"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        {...numericFieldProps}
                        className="w-24 ml-auto text-right tabular-nums"
                        value={r.exitStr}
                        onChange={(e) =>
                          setUnregExits((prev) => ({ ...prev, [r.item.productId]: sanitizeNumericInput(e.target.value) }))
                        }
                        placeholder={r.autoExit > 0 ? `auto ${r.autoExit}` : "0"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                      {formatStock(r.calculated, r.item.product.unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        {...numericFieldProps}
                        className={`w-24 ml-auto text-right tabular-nums ${
                          finalIsEmpty ? "border-red-300 focus-visible:ring-red-400" : ""
                        }`}
                        value={r.finalStr}
                        onChange={(e) =>
                          setFinalCounts((prev) => ({ ...prev, [r.item.productId]: sanitizeNumericInput(e.target.value) }))
                        }
                        placeholder="0"
                      />
                    </td>
                    </tr>
                    {r.effEntry > 0 && (
                      <tr className="bg-emerald-50/40">
                        <td colSpan={8} className="px-4 py-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-xs font-medium text-emerald-700 shrink-0">
                              Justifica la entrada NR de {r.item.product.name} (+{formatStock(r.effEntry, r.item.product.unit)}):
                            </span>
                            <Input
                              type="text"
                              placeholder="Motivo (por qué no se registró)"
                              value={entryReasons[r.item.productId] ?? ""}
                              onChange={(ev) => setEntryReasons((p) => ({ ...p, [r.item.productId]: ev.target.value }))}
                              className="text-sm flex-1"
                            />
                            <Input
                              type="time"
                              value={entryTimes[r.item.productId] ?? ""}
                              onChange={(ev) => setEntryTimes((p) => ({ ...p, [r.item.productId]: ev.target.value }))}
                              className="text-sm w-full sm:w-40"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        ))}

        {numericItems.length > 0 && (
        <p className="text-xs text-slate-500">
          <strong>Entrada / Salida NR</strong>: cantidades que ocurrieron pero no fueron registradas como movimiento. Si los dejas vacíos, se calculan automáticamente a partir de la diferencia entre el conteo real y el esperado.
        </p>
        )}

        <div className="flex gap-3">
          {canClose ? (
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? "Cerrando..." : "Confirmar y cerrar jornada"}
            </Button>
          ) : (
            <p className="text-xs text-amber-700">No tienes permiso para cerrar el inventario de esta categoría.</p>
          )}
        </div>
      </form>

      <CloseConfirmDialog
        open={confirmDialog}
        onOpenChange={setConfirmDialog}
        autoExits={rows
          .filter((r) => r.exitStr.trim() === "" && r.autoExit > 0)
          .map((r) => ({ name: r.item.product.name, qty: r.autoExit, unit: r.item.product.unit }))}
        entries={rows
          .filter((r) => r.effEntry > 0)
          .map((r) => ({ productId: r.item.productId, name: r.item.product.name, qty: r.effEntry, unit: r.item.product.unit }))}
        zeros={rows
          .filter((r) => (parseField(r.finalStr) ?? 0) === 0)
          .map((r) => r.item.product.name)}
        onConfirm={() => {
          setConfirmDialog(false);
          void submitClose(pendingClose);
        }}
        loading={loading}
      />

      {/* Descartar jornada abierta */}
      <Dialog open={discardDialog} onOpenChange={(v) => { if (!discarding) setDiscardDialog(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" />
              Descartar jornada
            </DialogTitle>
            <DialogDescription>
              Se eliminará el registro de esta jornada abierta y se revertirá cualquier ajuste de
              stock hecho al abrirla. Esta acción no se puede deshacer. Quedará registrada en auditoría.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="discard-reason" className="text-sm font-medium text-slate-700">
              Justificación <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="discard-reason"
              placeholder="Ej: Se abrió la categoría equivocada, se debe reiniciar el conteo..."
              value={discardReason}
              onChange={(e) => setDiscardReason(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={discarding}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDiscardDialog(false)} disabled={discarding}>
              Cancelar
            </Button>
            <Button
              onClick={handleDiscard}
              disabled={discarding || !discardReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {discarding ? "Descartando..." : "Descartar jornada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar conteo inicial */}
      <Dialog open={editInitialDialog} onOpenChange={(v) => { if (!savingInitial) setEditInitialDialog(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Editar conteo inicial
            </DialogTitle>
            <DialogDescription>
              Corrige el conteo inicial de la jornada. Los productos <strong>nuevos</strong> creados
              después de abrirla aparecen aquí para incluirlos en el conteo. El stock se reconcilia
              automáticamente, preservando los movimientos ya ocurridos hoy.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
            {numericCategoryProducts.map((p) => {
              const isNew = !itemProductIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm font-medium text-slate-800 flex items-center gap-2 min-w-0">
                    <span className="truncate">{p.name}</span>
                    {isNew && (
                      <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] shrink-0">Nuevo</Badge>
                    )}
                  </span>
                  <Input
                    {...numericFieldProps}
                    className="w-28 text-right tabular-nums shrink-0"
                    value={editInitialCounts[p.id] ?? ""}
                    onChange={(e) =>
                      setEditInitialCounts((prev) => ({ ...prev, [p.id]: sanitizeNumericInput(e.target.value) }))
                    }
                    disabled={savingInitial}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditInitialDialog(false)} disabled={savingInitial}>
              Cancelar
            </Button>
            <Button onClick={handleSaveInitial} disabled={savingInitial} className="bg-blue-600 hover:bg-blue-700">
              {savingInitial ? "Guardando..." : "Guardar corrección"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const bottleItems = inventory.items.filter((i) => productIsBottle(i.product));
  const numericItems = inventory.items.filter((i) => !productIsBottle(i.product));
  const rows = numericItems.map((item) => {
    const { entries, exits } = calcMovements(movements, item.productId);
    const expected = item.initialCount + entries - exits;
    const unregEntry = item.unregisteredEntry ?? 0;
    const unregExit  = item.unregisteredExit  ?? 0;
    const finalCount = item.finalCount ?? 0;
    const calculated = expected + unregEntry - unregExit;
    const diff = finalCount - calculated;
    return { item, entries, exits, expected, unregEntry, unregExit, finalCount, calculated, diff };
  });

  const hasUnregistered  = rows.some((r) => r.unregEntry > 0 || r.unregExit > 0);

  // Categorías en el mismo orden del conteo (categoría → nombre), cada una
  // como su propia tarjeta — igual que en las vistas de apertura y cierre.
  const rowsByProduct = new Map(rows.map((r) => [r.item.productId, r]));
  const bottleByProduct = new Map(bottleItems.map((i) => [i.productId, i]));
  const categoryCards = groupByCategory(inventory.items, (i) => categoryName(i.product)).map(([name, items]) => ({
    name,
    isBottle: productIsBottle(items[0].product),
    rows: items.map((i) => rowsByProduct.get(i.productId)).filter((r): r is (typeof rows)[number] => !!r),
    bottleItems: items.map((i) => bottleByProduct.get(i.productId)).filter((i): i is (typeof bottleItems)[number] => !!i),
  }));

  return (
    <div className="space-y-6">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Jornada cerrada</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Cerrado por {inventory.closedBy ?? "—"}.{" "}
              {hasUnregistered
                ? "Se registraron entradas/salidas no registradas calculadas en el cierre."
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

      {categoryCards.map((cat) => cat.isBottle ? (
        <div key={cat.name} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat.name} · nivel de botella</span>
          </div>
          <div className="divide-y divide-slate-100">
            {cat.bottleItems.map((i) => (
              <div key={i.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="font-medium text-slate-800 text-sm">{i.product.name}</span>
                <div className="flex items-center gap-3">
                  <BottleLevelBadge level={isBottleLevel(i.bottleLevel) ? i.bottleLevel : null} />
                  <span className="text-xs text-slate-500">Reserva: <strong className="tabular-nums">{i.reserveBottles ?? 0}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div key={cat.name} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat.name}</span>
        </div>

        {/* Móvil: tarjeta de resultados por producto */}
        <div className="lg:hidden p-3 space-y-3">
        {cat.rows.map((r) => {
          const unit = r.item.product.unit;
          return (
            <div key={r.item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-medium text-slate-800 flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{r.item.product.name}</span>
                  <ShotsCopeoBadge active={!!r.item.shotsCopeo} />
                </span>
                <span className="text-sm font-semibold text-slate-800 tabular-nums">
                  {formatStock(r.finalCount, unit)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Inicial <strong className="text-slate-600 tabular-nums">{formatStock(r.item.initialCount, unit)}</strong></span>
                {r.entries > 0 && <span className="text-emerald-600 tabular-nums">+{formatStock(r.entries, unit)} ent.</span>}
                {r.exits > 0 && <span className="text-red-500 tabular-nums">−{formatStock(r.exits, unit)} sal.</span>}
                {r.unregEntry > 0 && <span className="text-emerald-700 tabular-nums">+{formatStock(r.unregEntry, unit)} NR</span>}
                {r.unregExit > 0 && <span className="text-red-600 tabular-nums">−{formatStock(r.unregExit, unit)} NR</span>}
                <span>Esperado <strong className="text-slate-600 tabular-nums">{formatStock(r.calculated, unit)}</strong></span>
              </div>
            </div>
          );
        })}
        </div>

        {/* Escritorio: tabla de resultados */}
        <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cat.rows.map((r) => {
              return (
                <tr key={r.item.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span>{r.item.product.name}</span>
                      <ShotsCopeoBadge active={!!r.item.shotsCopeo} />
                    </div>
                  </td>
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
                    {formatStock(r.calculated, r.item.product.unit)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800">
                    {formatStock(r.finalCount, r.item.product.unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      ))}

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
  category,
  canOpen,
  canClose,
  canReopen,
  canManageOpen,
  history,
}: Props) {
  const router = useRouter();
  const isToday = date === today;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/inventario-diario"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 mb-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Todas las categorías
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Inventario Diario · {category.name}
          </h1>
          <p className="text-slate-500 text-sm mt-1 capitalize">{formatDate(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/inventario-diario?categoria=${category.slug}`)}
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

      <HistoryPanel history={history} currentDate={date} categorySlug={category.slug} />

      {!existing ? (
        isToday ? (
          canOpen ? (
            <CreateView date={date} allProducts={allProducts} category={category} />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
              <p className="text-slate-500 text-sm">No tienes permiso para abrir el inventario de esta categoría.</p>
            </div>
          )
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <p className="text-slate-500 text-sm">No hay inventario registrado para esta fecha.</p>
          </div>
        )
      ) : existing.status === "open" ? (
        <OpenView inventory={existing} movements={movements} category={category} canClose={canClose} canManageOpen={canManageOpen} allProducts={allProducts} />
      ) : (
        <ClosedView inventory={existing} movements={movements} canReopen={canReopen} />
      )}
    </div>
  );
}
