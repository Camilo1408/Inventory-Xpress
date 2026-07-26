"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { sanitizeNumericInput, parseNumericValue, numericFieldProps } from "@/lib/numeric";

interface MovementActionsProps {
  movement: {
    id: string;
    type: string; // ENTRY | EXIT | ADJUSTMENT (solo manuales llegan aquí)
    quantity: number;
    notes: string | null;
    productName: string;
    unit: string;
  };
}

const TYPE_LABEL: Record<string, string> = { ENTRY: "Entrada", EXIT: "Salida", ADJUSTMENT: "Ajuste" };

/** Botones de corrección de un movimiento manual: editar (cantidad/notas) y
 *  eliminar (revierte su efecto en stock). Los errores de la API (jornada
 *  cerrada, stock negativo, etc.) se muestran tal cual al usuario. */
export function MovementActions({ movement }: MovementActionsProps) {
  const router = useRouter();
  const isAdjustment = movement.type === "ADJUSTMENT";

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // ENTRY/SALIDA se muestran en magnitud positiva (el signo lo pone el tipo);
  // AJUSTE conserva su signo.
  const [quantity, setQuantity] = useState(String(isAdjustment ? movement.quantity : Math.abs(movement.quantity)));
  const [notes, setNotes] = useState(movement.notes ?? "");

  function openEdit() {
    setQuantity(String(isAdjustment ? movement.quantity : Math.abs(movement.quantity)));
    setNotes(movement.notes ?? "");
    setEditOpen(true);
  }

  async function submitEdit() {
    const qty = parseNumericValue(quantity);
    if (isNaN(qty) || qty === 0) {
      toast.error("Cantidad inválida");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/movements/${movement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty, notes: notes.trim() || null }),
    });
    const data = await res.json() as { error?: string };
    setLoading(false);
    if (res.ok) {
      toast.success("Movimiento corregido");
      setEditOpen(false);
      router.refresh();
    } else {
      toast.error(data.error ?? "Error al corregir el movimiento");
    }
  }

  async function submitDelete() {
    setLoading(true);
    const res = await fetch(`/api/movements/${movement.id}`, { method: "DELETE" });
    const data = await res.json() as { error?: string };
    setLoading(false);
    if (res.ok) {
      toast.success("Movimiento eliminado y stock revertido");
      setDeleteOpen(false);
      router.refresh();
    } else {
      toast.error(data.error ?? "Error al eliminar el movimiento");
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openEdit}
          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Corregir movimiento"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Eliminar movimiento"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editar */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!loading) setEditOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corregir {TYPE_LABEL[movement.type] ?? movement.type}</DialogTitle>
            <DialogDescription>
              {movement.productName} — el stock se recalculará con la diferencia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-qty">Cantidad *</Label>
              <Input
                id="edit-qty"
                {...numericFieldProps}
                value={quantity}
                onChange={(e) => setQuantity(sanitizeNumericInput(e.target.value, { allowNegative: isAdjustment }))}
              />
              {isAdjustment && (
                <p className="text-xs text-slate-400">Positivo aumenta el stock, negativo lo disminuye.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Observaciones</Label>
              <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? "Guardando..." : "Guardar corrección"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { if (!loading) setDeleteOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Eliminar movimiento</DialogTitle>
            <DialogDescription>
              Se eliminará la {TYPE_LABEL[movement.type]?.toLowerCase() ?? "operación"} de{" "}
              <strong>{movement.productName}</strong> ({movement.quantity > 0 ? "+" : ""}{movement.quantity} {movement.unit})
              y su efecto en el stock se revertirá. Esta acción queda registrada en auditoría.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={submitDelete} disabled={loading} className="bg-red-600 hover:bg-red-700">
              {loading ? "Eliminando..." : "Eliminar y revertir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
