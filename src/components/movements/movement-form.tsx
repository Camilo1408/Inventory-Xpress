"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatStock, getStockStatus } from "@/lib/utils";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  category: { name: string };
}

const stockBadge = {
  ok: "bg-emerald-100 text-emerald-700 border-0",
  low: "bg-amber-100 text-amber-700 border-0",
  empty: "bg-red-100 text-red-700 border-0",
};

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
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger>
            <SelectValue placeholder="Buscar producto..." />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — {p.category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
