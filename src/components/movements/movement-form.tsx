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
import { ChevronDown, Search, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  category: { name: string } | null;
}

const stockBadge = {
  ok: "bg-emerald-100 text-emerald-700 border-0",
  low: "bg-amber-100 text-amber-700 border-0",
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

  // Reset highlight when results change
  useEffect(() => { setHighlighted(0); }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  // Close on outside click
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

  const displayValue = open ? search : (selected ? `${selected.name}${selected.category ? ` — ${selected.category.name}` : ""}` : "");

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

export function MovementForm({ products, canAdjust }: { products: Product[]; canAdjust: boolean }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"ENTRY" | "EXIT" | "ADJUSTMENT">("ENTRY");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedProduct = products.find((p) => p.id === productId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !quantity) {
      toast.error("Selecciona un producto e ingresa la cantidad");
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
      body: JSON.stringify({ productId, type, quantity: qty, notes: notes.trim() || undefined }),
    });

    const data = await res.json() as { error?: string; product?: { currentStock: number } };
    setLoading(false);

    if (res.ok) {
      toast.success(`Movimiento registrado. Stock: ${data.product ? formatStock(data.product.currentStock, selectedProduct?.unit ?? "") : ""}`);
      setProductId("");
      setQuantity("");
      setNotes("");
      router.refresh();
    } else {
      toast.error(data.error ?? "Error al registrar movimiento");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label>Producto *</Label>
        <ProductCombobox products={products} value={productId} onChange={setProductId} />
      </div>

      {selectedProduct && (
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
      )}

      <div className="space-y-1.5">
        <Label>Tipo de movimiento *</Label>
        <div className="flex gap-2">
          {(["ENTRY", "EXIT", ...(canAdjust ? ["ADJUSTMENT"] : [])] as Array<"ENTRY" | "EXIT" | "ADJUSTMENT">).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                type === t
                  ? t === "ENTRY"
                    ? "bg-blue-600 text-white border-blue-600"
                    : t === "EXIT"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-slate-700 text-white border-slate-700"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {t === "ENTRY" ? "Entrada" : t === "EXIT" ? "Salida" : "Ajuste"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quantity">Cantidad *</Label>
        <Input
          id="quantity"
          type="number"
          step="0.5"
          min={type === "ADJUSTMENT" ? undefined : "0.5"}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0"
          required
        />
        {type === "ADJUSTMENT" && (
          <p className="text-xs text-slate-400">Usa valores positivos para aumentar, negativos para disminuir</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Observaciones (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej: Compra semanal, merma..."
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
