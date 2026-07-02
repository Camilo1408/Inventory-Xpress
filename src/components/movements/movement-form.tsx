"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatStock, getStockStatus } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronDown, Search, X, Ban } from "lucide-react";
import { isBottleTrackedSlug, isBottleLevel, bottleStock, emptyOpenBottle, type BottleLevel } from "@/lib/bottle";
import { BottleLevelSelector, BottleLevelBadge, ReserveCounter } from "@/components/inventario/bottle-level-selector";
import { sanitizeNumericInput } from "@/lib/numeric";

interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  bottleLevel: string | null;
  reserveBottles: number | null;
  category: { name: string; slug: string | null } | null;
}

const stockBadge = {
  ok:    "bg-emerald-100 text-emerald-700 border-0",
  low:   "bg-amber-100 text-amber-700 border-0",
  empty: "bg-red-100 text-red-700 border-0",
};

// ─── Combobox de búsqueda de productos ───────────────────────────────────────

function ProductCombobox({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = products.find((p) => p.id === value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = search.trim()
    ? products.filter((p) =>
        `${p.name} ${p.category?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : products;

  useEffect(() => { setHighlighted(0); }, [search]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectProduct = useCallback(
    (p: Product) => {
      onChange(p.id);
      setOpen(false);
      setSearch("");
      inputRef.current?.blur();
    },
    [onChange]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); e.preventDefault(); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) selectProduct(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  const displayValue = open
    ? search
    : (selected ? `${selected.name}${selected.category ? ` — ${selected.category.name}` : ""}` : "");

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder="Buscar producto..."
          onFocus={() => setOpen(true)}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full h-10 pl-9 pr-9 rounded-md border border-input bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            onClick={() => { onChange(""); setSearch(""); inputRef.current?.focus(); setOpen(true); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        )}
      </div>

      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-400 text-center">Sin resultados</li>
          ) : (
            filtered.map((p, i) => (
              <li
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); selectProduct(p); }}
                onMouseEnter={() => setHighlighted(i)}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 ${
                  i === highlighted ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                } ${value === p.id ? "font-medium" : ""}`}
              >
                <span>{p.name}</span>
                <span className={`text-xs shrink-0 ${i === highlighted ? "text-blue-500" : "text-slate-400"}`}>
                  {p.category?.name ?? ""}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Formulario de movimiento ─────────────────────────────────────────────────

type NumericType = "ENTRY" | "EXIT" | "ADJUSTMENT";
type BottleType  = "ENTRY" | "EXIT" | "BOTTLE_ADJUST";

export function MovementForm({ products, canAdjust }: { products: Product[]; canAdjust: boolean }) {
  const router = useRouter();
  const [productId, setProductId]     = useState("");
  const [numericType, setNumericType] = useState<NumericType>("ENTRY");
  const [bottleType, setBottleType]   = useState<BottleType>("BOTTLE_ADJUST");
  const [quantity, setQuantity]       = useState("");
  const [notes, setNotes]             = useState("");
  const [loading, setLoading]         = useState(false);

  // Estado botella
  const [bottleLevel, setBottleLevel]     = useState<BottleLevel | null>(null);
  const [reserveBottles, setReserveBottles] = useState(0);

  const selectedProduct = products.find((p) => p.id === productId);
  const isBottle = isBottleTrackedSlug(selectedProduct?.category?.slug ?? null);

  // Sincronizar estado de botella al cambiar producto
  useEffect(() => {
    if (!selectedProduct) return;
    const lvl = isBottleLevel(selectedProduct.bottleLevel) ? selectedProduct.bottleLevel as BottleLevel : null;
    setBottleLevel(lvl);
    setReserveBottles(selectedProduct.reserveBottles ?? 0);
    setQuantity("");
    setNotes("");
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setProductId("");
    setQuantity("");
    setNotes("");
    setBottleLevel(null);
    setReserveBottles(0);
  }

  // ── Submit para productos de BOTELLA ────────────────────────────────────────
  async function handleBottleSubmit() {
    setLoading(true);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        type: bottleType,
        ...(bottleType === "BOTTLE_ADJUST"
          ? { bottleLevel, reserveBottles }
          : { quantity: Math.ceil(parseFloat(quantity) || 0) }),
        notes: notes.trim() || undefined,
      }),
    });
    const data = await res.json() as {
      error?: string;
      product?: { currentStock: number; bottleLevel?: string | null; reserveBottles?: number | null };
    };
    setLoading(false);

    if (res.ok && data.product) {
      const total = data.product.currentStock;
      toast.success(
        `Registrado. Disponibles: ${total} botella${total !== 1 ? "s" : ""}`
      );
      resetForm();
      router.refresh();
    } else {
      toast.error(data.error ?? "Error al registrar movimiento");
    }
  }

  // ── Submit para productos NUMÉRICOS ─────────────────────────────────────────
  async function handleNumericSubmit() {
    if (!quantity) {
      toast.error("Ingresa la cantidad");
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty === 0) {
      toast.error("Cantidad inválida");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, type: numericType, quantity: qty, notes: notes.trim() || undefined }),
    });
    const data = await res.json() as { error?: string; product?: { currentStock: number } };
    setLoading(false);

    if (res.ok) {
      toast.success(
        `Movimiento registrado. Stock: ${data.product ? formatStock(data.product.currentStock, selectedProduct?.unit ?? "") : ""}`
      );
      resetForm();
      router.refresh();
    } else {
      toast.error(data.error ?? "Error al registrar movimiento");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      toast.error("Selecciona un producto");
      return;
    }
    if (isBottle) {
      await handleBottleSubmit();
    } else {
      await handleNumericSubmit();
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const totalBottleStock = bottleStock(selectedProduct?.bottleLevel, selectedProduct?.reserveBottles);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Producto */}
      <div className="space-y-1.5">
        <Label>Producto *</Label>
        <ProductCombobox products={products} value={productId} onChange={setProductId} />
      </div>

      {/* Info del producto seleccionado */}
      {selectedProduct && (
        isBottle ? (
          <div className="bg-slate-50 rounded-md p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500">Botella abierta:</span>
              <BottleLevelBadge level={selectedProduct.bottleLevel as BottleLevel | null} />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-slate-500">
                Reserva: <span className="font-semibold text-slate-800">{selectedProduct.reserveBottles ?? 0}</span>
              </span>
              <span className="text-slate-500">
                Total disponible:{" "}
                <span className={`font-semibold ${totalBottleStock > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {totalBottleStock} botella{totalBottleStock !== 1 ? "s" : ""}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-md p-3 flex items-center gap-3 text-sm">
            <span className="text-slate-600">Stock actual:</span>
            <span className="font-semibold tabular-nums">
              {formatStock(selectedProduct.currentStock, selectedProduct.unit)}
            </span>
            <Badge className={stockBadge[getStockStatus(selectedProduct.currentStock, selectedProduct.minStock)]}>
              {getStockStatus(selectedProduct.currentStock, selectedProduct.minStock) === "ok" ? "En stock" :
               getStockStatus(selectedProduct.currentStock, selectedProduct.minStock) === "low" ? "Bajo mínimo" : "Sin stock"}
            </Badge>
          </div>
        )
      )}

      {/* Tipo de movimiento */}
      <div className="space-y-1.5">
        <Label>Tipo de movimiento *</Label>
        {isBottle ? (
          <div className="flex gap-2">
            {(["ENTRY", "EXIT", ...(canAdjust ? ["BOTTLE_ADJUST"] : [])] as BottleType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setBottleType(t)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                  bottleType === t
                    ? t === "ENTRY"      ? "bg-blue-600 text-white border-blue-600"
                    : t === "EXIT"       ? "bg-red-600 text-white border-red-600"
                    : "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {t === "ENTRY" ? "Entrada" : t === "EXIT" ? "Salida" : "Ajuste Nivel"}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            {(["ENTRY", "EXIT", ...(canAdjust ? ["ADJUSTMENT"] : [])] as NumericType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNumericType(t)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                  numericType === t
                    ? t === "ENTRY"      ? "bg-blue-600 text-white border-blue-600"
                    : t === "EXIT"       ? "bg-red-600 text-white border-red-600"
                    : "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {t === "ENTRY" ? "Entrada" : t === "EXIT" ? "Salida" : "Ajuste"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inputs según tipo de producto / movimiento */}
      {isBottle && bottleType === "BOTTLE_ADJUST" ? (
        // ─── Ajuste de nivel de botella ──────────────────────────────────────
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nivel de la botella abierta</Label>
            <div className="flex flex-wrap items-center gap-2">
              <BottleLevelSelector
                value={bottleLevel}
                onChange={setBottleLevel}
              />
              {/* Marcar la botella abierta como vacía/consumida.
                  Si hay reserva, destapa una nueva (reserva −1, nivel Llena). */}
              <button
                type="button"
                onClick={() => {
                  const next = emptyOpenBottle(reserveBottles);
                  setBottleLevel(next.level);
                  setReserveBottles(next.reserve);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
              >
                <Ban className="w-3.5 h-3.5" />
                Vaciar
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {bottleLevel === null
                ? "Sin botella abierta y sin reserva — stock disponible quedará en 0."
                : "Botella abierta con contenido — cuenta como +1 disponible. Al vaciarla, si hay reserva se destapa una nueva."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Botellas en reserva (cerradas)</Label>
            <ReserveCounter value={reserveBottles} onChange={setReserveBottles} />
            <p className="text-xs text-slate-400">
              Total disponible tras el ajuste:{" "}
              <strong>{bottleStock(bottleLevel, reserveBottles)}</strong> botella
              {bottleStock(bottleLevel, reserveBottles) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      ) : (
        // ─── Cantidad numérica (ENTRY / EXIT — botella o normal) ─────────────
        <div className="space-y-1.5">
          <Label htmlFor="quantity">
            {isBottle ? "Cantidad de botellas *" : "Cantidad *"}
          </Label>
          <Input
            id="quantity"
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(sanitizeNumericInput(e.target.value))}
            placeholder="0"
            required
          />
          {!isBottle && numericType === "ADJUSTMENT" && (
            <p className="text-xs text-slate-400">Usa valores positivos para aumentar, negativos para disminuir</p>
          )}
          {isBottle && (
            <p className="text-xs text-slate-400">
              {bottleType === "ENTRY"
                ? "Botellas que se agregan a la reserva (cerradas)."
                : "Botellas que se retiran de la reserva."}
            </p>
          )}
        </div>
      )}

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Observaciones (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isBottle && bottleType === "BOTTLE_ADJUST"
            ? "Ej: Revisión semanal, apertura de nueva botella..."
            : "Ej: Compra semanal, merma..."}
          rows={2}
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700"
        disabled={loading || !productId}
      >
        {loading ? "Registrando..." : "Registrar movimiento"}
      </Button>
    </form>
  );
}
