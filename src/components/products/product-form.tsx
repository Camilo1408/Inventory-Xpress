"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUpload } from "./image-upload";
import { BOTTLE_LEVELS, isBottleLevel, isBottleTrackedSlug } from "@/lib/bottle";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug?: string | null;
  children?: { id: string; name: string; slug?: string | null }[];
}

interface ProductFormProps {
  categories: Category[];
  initialData?: {
    id: string;
    name: string;
    categoryId: string | null;
    unit: string;
    minStock: number;
    imageUrl: string | null;
    alertBottleLevel?: string | null;
  };
}

const UNITS = ["unidades", "litros", "kg", "cajas", "botellas", "porciones", "gramos"];

export function ProductForm({ categories, initialData }: ProductFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [categoryId, setCategoryId] = useState(initialData?.categoryId ?? (isEdit ? "__none__" : ""));
  const [unit, setUnit] = useState(initialData?.unit ?? "");
  const [minStock, setMinStock] = useState(initialData?.minStock?.toString() ?? "0");
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "");
  const [alertBottleLevel, setAlertBottleLevel] = useState<string>(
    isBottleLevel(initialData?.alertBottleLevel) ? initialData!.alertBottleLevel! : "__default__"
  );
  const [loading, setLoading] = useState(false);

  const selectedSlug = (() => {
    for (const cat of categories) {
      if (cat.id === categoryId) return cat.slug ?? null;
      const sub = cat.children?.find((c) => c.id === categoryId);
      if (sub) return sub.slug ?? null;
    }
    return null;
  })();
  const showBottleAlert = isBottleTrackedSlug(selectedSlug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || (!isEdit && !categoryId) || !unit) {
      toast.error(isEdit ? "Nombre y unidad son requeridos" : "Nombre, categoría y unidad son requeridos");
      return;
    }

    setLoading(true);

    const payload = {
      name: name.trim(),
      categoryId: (categoryId === "__none__" || !categoryId) ? null : categoryId,
      unit,
      minStock: parseFloat(minStock) || 0,
      imageUrl: imageUrl || null,
      alertBottleLevel: showBottleAlert && alertBottleLevel !== "__default__" ? alertBottleLevel : null,
    };

    const res = await fetch(
      isEdit ? `/api/products/${initialData.id}` : "/api/products",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    setLoading(false);

    if (res.ok) {
      toast.success(isEdit ? "Producto actualizado" : "Producto creado");
      router.push("/productos");
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al guardar");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre del producto *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Ron Blanco"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Categoría{!isEdit && " *"}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {isEdit && (
                <SelectItem value="__none__">Sin categoría</SelectItem>
              )}
              {categories.map((cat) =>
                cat.children && cat.children.length > 0 ? (
                  <SelectGroup key={cat.id}>
                    <SelectLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {cat.name}
                    </SelectLabel>
                    {cat.children.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Unidad *</Label>
          <Select value={unit} onValueChange={setUnit} required>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="minStock">Stock mínimo</Label>
        <Input
          id="minStock"
          type="number"
          min="0"
          step="0.5"
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
          placeholder="0"
        />
        <p className="text-xs text-slate-400">Se generará una alerta cuando el stock baje de este valor</p>
      </div>

      {showBottleAlert && (
        <div className="space-y-1.5">
          <Label>Alertar cuando la botella esté en</Label>
          <Select value={alertBottleLevel} onValueChange={setAlertBottleLevel}>
            <SelectTrigger>
              <SelectValue placeholder="Casi vacía (por defecto)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Casi vacía (por defecto)</SelectItem>
              {BOTTLE_LEVELS.map((l) => (
                <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-400">Para licores de cócteles: nivel a partir del cual se sugiere comprar (si no hay reserva).</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Foto del producto (opcional)</Label>
        <ImageUpload value={imageUrl} onChange={setImageUrl} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/productos")}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700"
          disabled={loading}
        >
          {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
