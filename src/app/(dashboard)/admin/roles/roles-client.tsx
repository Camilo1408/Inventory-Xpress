"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface PermissionDef { key: string; label: string; description: string; group: string; }
interface RoleData {
  id: string; name: string; slug: string; description: string | null;
  permissions: string[]; active: boolean; userCount: number;
}
interface BaseRoleInfo { role: string; label: string; description: string; permissions: string[]; }

interface Props {
  roles: RoleData[];
  catalog: PermissionDef[];
  baseRoles: BaseRoleInfo[];
}

export function RolesClient({ roles, catalog, baseRoles }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<RoleData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleData | null>(null);

  // Agrupar catálogo por grupo, preservando el orden de aparición.
  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()];
  }, [catalog]);

  function openNew() {
    setIsNew(true);
    setEditing(null);
    setName("");
    setDescription("");
    setPerms(new Set());
  }

  function openEdit(role: RoleData) {
    setIsNew(false);
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? "");
    setPerms(new Set(role.permissions));
  }

  function closeDialog() {
    setEditing(null);
    setIsNew(false);
  }

  function togglePerm(key: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("El nombre del rol es requerido");
      return;
    }
    setLoading(true);
    const payload = { name: name.trim(), description: description.trim(), permissions: [...perms] };
    const res = isNew
      ? await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/admin/roles/${editing!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setLoading(false);
    if (res.ok) {
      toast.success(isNew ? "Rol creado" : "Rol actualizado");
      closeDialog();
      router.refresh();
    } else {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      toast.error(data?.error ?? "Error al guardar el rol");
    }
  }

  async function handleToggleActive(role: RoleData) {
    const res = await fetch(`/api/admin/roles/${role.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !role.active }),
    });
    if (res.ok) {
      toast.success(role.active ? "Rol desactivado" : "Rol activado");
      router.refresh();
    } else {
      toast.error("Error al cambiar estado");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setLoading(true);
    const res = await fetch(`/api/admin/roles/${deleteTarget.id}`, { method: "DELETE" });
    setLoading(false);
    setDeleteTarget(null);
    if (res.ok) {
      toast.success("Rol eliminado");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      toast.error(data?.error ?? "Error al eliminar el rol");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo rol
        </Button>
      </div>

      {/* Roles personalizados */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Nombre</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Permisos</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Usuarios</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-slate-800">{r.name}</div>
                  {r.description && <div className="text-xs text-slate-400 mt-0.5">{r.description}</div>}
                </td>
                <td className="px-4 py-3 text-center text-sm text-slate-600 tabular-nums">{r.permissions.length}</td>
                <td className="px-4 py-3 text-center text-sm text-slate-600 tabular-nums">{r.userCount}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className={r.active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-400 border-0"}>
                    {r.active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" title="Editar" onClick={() => openEdit(r)}>
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                    <Button size="sm" variant="ghost" title={r.active ? "Desactivar" : "Activar"} onClick={() => handleToggleActive(r)}>
                      <Power className={`w-3.5 h-3.5 ${r.active ? "text-amber-500" : "text-emerald-500"}`} />
                    </Button>
                    <Button size="sm" variant="ghost" title="Eliminar" onClick={() => setDeleteTarget(r)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay roles personalizados. Crea uno para asignar permisos a medida.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Roles base del sistema (informativo) */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Roles base del sistema</h3>
        <div className="space-y-2 text-sm">
          {baseRoles.map((br) => (
            <p key={br.role} className="text-slate-600">
              <span className="font-semibold text-slate-800">{br.label}</span>
              {" — "}{br.description}
              <span className="text-slate-400"> ({br.permissions.length} permisos)</span>
            </p>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Un rol personalizado reemplaza los permisos del rol base cuando se asigna a un usuario.
          Los permisos individuales (overrides) se aplican sobre el resultado.
        </p>
      </div>

      {/* Modal crear/editar rol */}
      <Dialog open={isNew || !!editing} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nuevo rol" : `Editar "${editing?.name}"`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Encargado de barra" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Para qué sirve este rol..." />
            </div>
            <div className="space-y-3">
              <Label>Permisos ({perms.size})</Label>
              {groups.map(([group, defs]) => (
                <div key={group} className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">{group}</div>
                  <div className="divide-y divide-slate-100">
                    {defs.map((p) => (
                      <label key={p.key} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={perms.has(p.key)}
                          onChange={() => togglePerm(p.key)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          <span className="text-sm font-medium text-slate-800">{p.label}</span>
                          <span className="block text-xs text-slate-400">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={loading}>
              {loading ? "Guardando..." : isNew ? "Crear rol" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={`Eliminar rol "${deleteTarget?.name}"`}
        description="Se eliminará el rol permanentemente. Solo es posible si no tiene usuarios asignados."
        confirmLabel="Eliminar"
        variant="destructive"
        loading={loading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
