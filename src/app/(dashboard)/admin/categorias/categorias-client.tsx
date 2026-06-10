"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, ChevronDown, ChevronRight, FolderOpen, Folder, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface SubCategory {
  id: string;
  name: string;
  active: boolean;
  _count: { products: number };
}

interface Category {
  id: string;
  name: string;
  active: boolean;
  _count: { products: number };
  children: SubCategory[];
}

// ─── Fila de subcategoría ─────────────────────────────────────────────────────

function SubCategoryRow({
  sub,
  onEdit,
  onToggleRequest,
  onDelete,
}: {
  sub: SubCategory;
  onEdit: (id: string, name: string) => void;
  onToggleRequest: (id: string, name: string, active: boolean) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 pl-10 pr-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
      <span className="text-slate-300 text-xs select-none">└</span>
      <span className={`flex-1 text-sm ${sub.active ? "text-slate-700" : "text-slate-400 line-through"}`}>
        {sub.name}
      </span>
      <span className="text-xs text-slate-400">{sub._count.products} productos</span>
      <Badge className={sub.active ? "bg-emerald-100 text-emerald-700 border-0 text-xs" : "bg-slate-100 text-slate-400 border-0 text-xs"}>
        {sub.active ? "Activa" : "Inactiva"}
      </Badge>
      <Button size="sm" variant="ghost" onClick={() => onEdit(sub.id, sub.name)} className="h-7 w-7 p-0">
        <Pencil className="w-3 h-3 text-slate-400" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onToggleRequest(sub.id, sub.name, sub.active)}
        className={`h-7 text-xs px-2 ${sub.active ? "text-slate-400 hover:text-slate-600" : "text-emerald-600 hover:text-emerald-700"}`}
      >
        {sub.active ? "Desactivar" : "Activar"}
      </Button>
      {sub._count.products === 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(sub.id, sub.name)}
          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CategoriasClient({ categories }: { categories: Category[] }) {
  const router = useRouter();

  // Nueva categoría raíz
  const [newName, setNewName] = useState("");
  // Nueva subcategoría: { [parentId]: string }
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);
  // Qué categorías están expandidas
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Qué categorías tienen el form de nueva subcategoría abierto
  const [addingSub, setAddingSub] = useState<Record<string, boolean>>({});
  // Edición inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

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

  async function handleCreateSub(parentId: string) {
    const name = newSubName[parentId]?.trim();
    if (!name) return;
    setLoading(true);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    setLoading(false);
    if (res.ok) {
      setNewSubName((prev) => ({ ...prev, [parentId]: "" }));
      setAddingSub((prev) => ({ ...prev, [parentId]: false }));
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
      toast.success("Subcategoría creada");
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
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al actualizar");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/categories/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteTarget(null);
    if (res.ok) {
      toast.success(`Categoría "${deleteTarget.name}" eliminada`);
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al eliminar");
    }
  }

  function handleDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  function handleToggleRequest(id: string, name: string, active: boolean) {
    setToggleTarget({ id, name, active });
  }

  async function confirmToggle() {
    if (!toggleTarget) return;
    setToggling(true);
    const res = await fetch(`/api/categories/${toggleTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !toggleTarget.active }),
    });
    setToggling(false);
    setToggleTarget(null);
    if (res.ok) {
      toast.success(toggleTarget.active ? `"${toggleTarget.name}" desactivada` : `"${toggleTarget.name}" activada`);
      router.refresh();
    } else {
      toast.error("Error al actualizar la categoría");
    }
  }

  return (
    <div className="space-y-6">
      {/* Formulario nueva categoría raíz */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Nueva categoría</p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej: Barra, Cocina, Almacén..."
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

      {/* Lista de categorías */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {categories.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">No hay categorías aún</div>
        )}

        {categories.map((cat, idx) => {
          const isExpanded = !!expanded[cat.id];
          const isAddingSub = !!addingSub[cat.id];
          const hasChildren = cat.children.length > 0;

          return (
            <div key={cat.id} className={idx > 0 ? "border-t border-slate-200" : ""}>
              {/* Fila categoría raíz */}
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50">
                {/* Toggle expand */}
                <button
                  type="button"
                  onClick={() => toggleExpand(cat.id)}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                >
                  {hasChildren || isAddingSub ? (
                    isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                  ) : (
                    <span className="w-4 h-4 inline-block" />
                  )}
                </button>

                {/* Icono carpeta */}
                {hasChildren || isAddingSub
                  ? <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                  : <Folder className="w-4 h-4 text-slate-300 shrink-0" />
                }

                {/* Nombre o input edición */}
                {editId === cat.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleEdit(cat.id);
                        if (e.key === "Escape") setEditId(null);
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(cat.id)} disabled={loading} className="h-7 w-7 p-0">
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-7 w-7 p-0">
                      <X className="w-4 h-4 text-slate-400" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm font-semibold ${cat.active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                      {cat.name}
                    </span>
                    <span className="text-xs text-slate-400">{cat._count.products} productos</span>
                    <Badge className={cat.active ? "bg-emerald-100 text-emerald-700 border-0 text-xs" : "bg-slate-100 text-slate-400 border-0 text-xs"}>
                      {cat.active ? "Activa" : "Inactiva"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditId(cat.id); setEditName(cat.name); }}
                      className="h-7 w-7 p-0"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleRequest(cat.id, cat.name, cat.active)}
                      className={`h-7 text-xs px-2 ${cat.active ? "text-slate-400 hover:text-slate-600" : "text-emerald-600 hover:text-emerald-700"}`}
                    >
                      {cat.active ? "Desactivar" : "Activar"}
                    </Button>
                    {/* Botón agregar subcategoría */}
                    {cat.active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddingSub((prev) => ({ ...prev, [cat.id]: true }));
                          setExpanded((prev) => ({ ...prev, [cat.id]: true }));
                        }}
                        className="h-7 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2"
                      >
                        <Plus className="w-3 h-3 mr-0.5" />
                        Subcategoría
                      </Button>
                    )}
                    {/* Botón eliminar — solo si no tiene productos */}
                    {cat._count.products === 0 && cat.children.every((c) => c._count.products === 0) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(cat.id, cat.name)}
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Subcategorías (si expandido) */}
              {isExpanded && (
                <>
                  {cat.children.map((sub) => (
                    editId === sub.id ? (
                      <div key={sub.id} className="flex items-center gap-2 pl-10 pr-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                        <span className="text-slate-300 text-xs select-none">└</span>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleEdit(sub.id);
                            if (e.key === "Escape") setEditId(null);
                          }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(sub.id)} disabled={loading} className="h-7 w-7 p-0">
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-7 w-7 p-0">
                          <X className="w-4 h-4 text-slate-400" />
                        </Button>
                      </div>
                    ) : (
                      <SubCategoryRow
                        key={sub.id}
                        sub={sub}
                        onEdit={(id, name) => { setEditId(id); setEditName(name); }}
                        onToggleRequest={handleToggleRequest}
                        onDelete={handleDelete}
                      />
                    )
                  ))}

                  {/* Form nueva subcategoría */}
                  {isAddingSub && (
                    <div className="flex items-center gap-2 pl-10 pr-4 py-2.5 border-t border-slate-100 bg-blue-50/40">
                      <span className="text-slate-300 text-xs select-none">└</span>
                      <Input
                        value={newSubName[cat.id] ?? ""}
                        onChange={(e) => setNewSubName((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                        placeholder="Nombre de subcategoría..."
                        className="flex-1 h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreateSub(cat.id);
                          if (e.key === "Escape") setAddingSub((prev) => ({ ...prev, [cat.id]: false }));
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleCreateSub(cat.id)}
                        disabled={loading || !newSubName[cat.id]?.trim()}
                        className="h-7 bg-blue-600 hover:bg-blue-700 text-xs px-3"
                      >
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAddingSub((prev) => ({ ...prev, [cat.id]: false }))}
                        className="h-7 w-7 p-0"
                      >
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(v) => { if (!v) setToggleTarget(null); }}
        title={toggleTarget?.active ? `Desactivar "${toggleTarget?.name}"` : `Activar "${toggleTarget?.name}"`}
        description={toggleTarget?.active
          ? "Los productos de esta categoría permanecerán activos, pero la categoría no estará disponible para nuevas asignaciones."
          : "La categoría volverá a estar disponible para asignar productos."
        }
        confirmLabel={toggleTarget?.active ? "Desactivar" : "Activar"}
        variant={toggleTarget?.active ? "destructive" : "default"}
        loading={toggling}
        onConfirm={confirmToggle}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={`Eliminar "${deleteTarget?.name}"`}
        description="Esta acción eliminará permanentemente la categoría y sus subcategorías vacías. No se puede deshacer."
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
