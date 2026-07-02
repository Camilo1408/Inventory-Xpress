"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCheck, UserX, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface PermissionDef { key: string; label: string; description: string; group: string; }
interface RoleData { id: string; name: string; permissions: string[]; }
interface BaseRoleInfo { role: string; label: string; permissions: string[]; }
interface UserData {
  id: string; username: string; name: string | null; role: string; active: boolean;
  customRoleId: string | null; customRoleName: string | null;
  permsGrant: string[]; permsRevoke: string[];
}

interface Props {
  users: UserData[];
  roles: RoleData[];
  baseRoles: BaseRoleInfo[];
  catalog: PermissionDef[];
}

const NO_CUSTOM = "__none__";

const baseRoleBadge: Record<string, string> = {
  SUPERADMIN: "bg-blue-100 text-blue-700 border-0",
  ADMIN:      "bg-violet-100 text-violet-700 border-0",
  EMPLOYEE:   "bg-slate-100 text-slate-600 border-0",
};

export function UsuariosClient({ users, roles, baseRoles, catalog }: Props) {
  const router = useRouter();

  // Modal state (crear/editar unificado)
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [baseRole, setBaseRole] = useState("EMPLOYEE");
  const [customRoleId, setCustomRoleId] = useState<string>(NO_CUSTOM);
  const [grant, setGrant] = useState<Set<string>>(new Set());
  const [revoke, setRevoke] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const baseRoleLabel = useMemo(
    () => Object.fromEntries(baseRoles.map((b) => [b.role, b.label])),
    [baseRoles]
  );
  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()];
  }, [catalog]);

  const isSuperadmin = baseRole === "SUPERADMIN";

  // Permisos "fuente" (rol personalizado si aplica, si no el rol base).
  const sourcePerms = useMemo<Set<string>>(() => {
    if (customRoleId !== NO_CUSTOM) {
      const r = roles.find((r) => r.id === customRoleId);
      return new Set(r?.permissions ?? []);
    }
    return new Set(baseRoles.find((b) => b.role === baseRole)?.permissions ?? []);
  }, [customRoleId, baseRole, roles, baseRoles]);

  // Permisos efectivos = SUPERADMIN → todos; si no (fuente ∪ grant) − revoke.
  const effective = useMemo<Set<string>>(() => {
    if (isSuperadmin) return new Set(catalog.map((p) => p.key));
    const e = new Set(sourcePerms);
    grant.forEach((k) => e.add(k));
    revoke.forEach((k) => e.delete(k));
    return e;
  }, [isSuperadmin, sourcePerms, grant, revoke, catalog]);

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setUsername(""); setName(""); setPassword("");
    setBaseRole("EMPLOYEE"); setCustomRoleId(NO_CUSTOM);
    setGrant(new Set()); setRevoke(new Set());
    setOpen(true);
  }

  function openEdit(u: UserData) {
    setMode("edit");
    setEditingId(u.id);
    setUsername(u.username); setName(u.name ?? ""); setPassword("");
    setBaseRole(u.role);
    setCustomRoleId(u.customRoleId ?? NO_CUSTOM);
    setGrant(new Set(u.permsGrant));
    setRevoke(new Set(u.permsRevoke));
    setOpen(true);
  }

  // Tri-estado por permiso: "inherit" | "grant" | "revoke"
  function permState(key: string): "inherit" | "grant" | "revoke" {
    if (grant.has(key)) return "grant";
    if (revoke.has(key)) return "revoke";
    return "inherit";
  }
  function setPermState(key: string, state: "inherit" | "grant" | "revoke") {
    setGrant((prev) => { const n = new Set(prev); n.delete(key); if (state === "grant") n.add(key); return n; });
    setRevoke((prev) => { const n = new Set(prev); n.delete(key); if (state === "revoke") n.add(key); return n; });
  }

  async function handleSave() {
    if (mode === "create" && (!username.trim() || !password)) {
      toast.error("Usuario y contraseña son requeridos");
      return;
    }
    setLoading(true);
    const payload = {
      ...(mode === "create" && { username: username.trim(), password }),
      ...(mode === "edit" && password && { password }),
      name: name.trim() || undefined,
      role: baseRole,
      customRoleId: customRoleId === NO_CUSTOM ? null : customRoleId,
      permsGrant: [...grant],
      permsRevoke: [...revoke],
    };
    const res = mode === "create"
      ? await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/admin/users/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setLoading(false);
    if (res.ok) {
      toast.success(mode === "create" ? "Usuario creado" : "Usuario actualizado");
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      toast.error(data?.error ?? "Error al guardar el usuario");
    }
  }

  async function handleToggle(u: UserData) {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    if (res.ok) {
      toast.success(u.active ? "Usuario desactivado" : "Usuario activado");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      toast.error(data?.error ?? "Error al cambiar estado");
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo usuario
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Usuario</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Rol base</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Rol personalizado</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Overrides</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const overrides = u.permsGrant.length + u.permsRevoke.length;
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{u.username}</div>
                    {u.name && <div className="text-xs text-slate-400">{u.name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={baseRoleBadge[u.role] ?? "bg-slate-100 text-slate-600 border-0"}>
                      {baseRoleLabel[u.role] ?? u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{u.customRoleName ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-sm text-slate-600 tabular-nums">
                    {u.role === "SUPERADMIN" ? "—" : overrides > 0 ? overrides : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={u.active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                      {u.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Editar" onClick={() => openEdit(u)}>
                        <Pencil className="w-3.5 h-3.5 text-slate-400" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        title={u.active ? "Desactivar" : "Activar"}
                        onClick={() => handleToggle(u)}
                      >
                        {u.active
                          ? <UserX className="w-3.5 h-3.5 text-amber-500" />
                          : <UserCheck className="w-3.5 h-3.5 text-emerald-500" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear/editar usuario */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Nuevo usuario" : `Editar "${username}"`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {mode === "create" && (
              <div className="space-y-1.5">
                <Label>Usuario *</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nombre (opcional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                {mode === "create" ? "Contraseña temporal *" : "Nueva contraseña (dejar vacío para no cambiar)"}
              </Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Rol base</Label>
                <Select value={baseRole} onValueChange={setBaseRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {baseRoles.map((b) => (
                      <SelectItem key={b.role} value={b.role}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rol personalizado</Label>
                <Select value={customRoleId} onValueChange={setCustomRoleId} disabled={isSuperadmin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CUSTOM}>Ninguno (usar rol base)</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isSuperadmin ? (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
                El rol <strong>Superadmin</strong> siempre tiene acceso completo. No se aplican roles personalizados ni permisos individuales.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Permisos individuales</Label>
                  <span className="text-xs text-slate-400">{effective.size} permisos efectivos</span>
                </div>
                <p className="text-xs text-slate-400">
                  Cada permiso hereda del rol; puedes forzarlo a <span className="text-emerald-600 font-medium">Conceder</span> o <span className="text-red-600 font-medium">Revocar</span> para este usuario.
                </p>
                {groups.map(([group, defs]) => (
                  <div key={group} className="border border-slate-200 rounded-md overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">{group}</div>
                    <div className="divide-y divide-slate-100">
                      {defs.map((p) => {
                        const fromRole = sourcePerms.has(p.key);
                        const state = permState(p.key);
                        const isEffective = effective.has(p.key);
                        return (
                          <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{p.label}</span>
                                <Badge className={isEffective ? "bg-emerald-100 text-emerald-700 border-0 text-[10px]" : "bg-slate-100 text-slate-400 border-0 text-[10px]"}>
                                  {isEffective ? "Sí" : "No"}
                                </Badge>
                              </div>
                              <span className="block text-xs text-slate-400">
                                {fromRole ? "Concedido por el rol" : "No incluido en el rol"}
                              </span>
                            </div>
                            <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs shrink-0">
                              {(["inherit", "grant", "revoke"] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setPermState(p.key, opt)}
                                  className={`px-2.5 py-1.5 transition-colors ${
                                    state === opt
                                      ? opt === "grant" ? "bg-emerald-600 text-white"
                                        : opt === "revoke" ? "bg-red-600 text-white"
                                        : "bg-slate-600 text-white"
                                      : "bg-white text-slate-500 hover:bg-slate-50"
                                  }`}
                                >
                                  {opt === "inherit" ? "Heredar" : opt === "grant" ? "Conceder" : "Revocar"}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={loading}>
              {loading ? "Guardando..." : mode === "create" ? "Crear usuario" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
