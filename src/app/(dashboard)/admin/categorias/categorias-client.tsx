"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  active: boolean;
  _count: { products: number };
}

export function CategoriasClient({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setLoading(true);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setLoading(false);
    if (res.ok) {
      setNewName("");
      toast.success("Categoría creada");
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al crear");
    }
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setLoading(false);
    if (res.ok) {
      setEditId(null);
      toast.success("Categoría actualizada");
      router.refresh();
    } else {
      toast.error("Error al actualizar");
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) {
      toast.success(active ? "Categoría desactivada" : "Categoría activada");
      router.refresh();
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="p-4 border-b border-slate-200">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nueva categoría..."
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1"
          />
          <Button
            onClick={handleCreate}
            disabled={loading || !newName.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Agregar
          </Button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
            {editId === cat.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEdit(cat.id);
                    if (e.key === "Escape") setEditId(null);
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => handleEdit(cat.id)} disabled={loading}>
                  <Check className="w-4 h-4 text-green-600" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                  <X className="w-4 h-4 text-slate-400" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-slate-800">{cat.name}</span>
                <span className="text-xs text-slate-400">{cat._count.products} productos</span>
                <Badge
                  className={cat.active
                    ? "bg-emerald-100 text-emerald-700 border-0"
                    : "bg-slate-100 text-slate-500 border-0"
                  }
                >
                  {cat.active ? "Activa" : "Inactiva"}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditId(cat.id); setEditName(cat.name); }}
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggle(cat.id, cat.active)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  {cat.active ? "Desactivar" : "Activar"}
                </Button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No hay categorías aún
          </div>
        )}
      </div>
    </div>
  );
}
