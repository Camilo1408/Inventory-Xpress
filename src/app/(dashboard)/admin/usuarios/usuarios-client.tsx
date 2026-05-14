"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface User {
  id: string;
  username: string;
  name: string | null;
  role: string;
  active: boolean;
}

export function UsuariosClient({ users }: { users: User[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [loading, setLoading] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  async function handleCreate() {
    if (!username.trim() || !password) {
      toast.error("Usuario y contraseña son requeridos");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), name: name.trim() || undefined, password, role }),
    });
    setLoading(false);
    if (res.ok) {
      setCreatedPassword(password);
      setUsername("");
      setName("");
      setPassword("");
      setRole("EMPLOYEE");
      toast.success("Usuario creado");
      router.refresh();
    } else {
      const data = await res.json() as { error?: string };
      toast.error(data.error ?? "Error al crear usuario");
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) {
      toast.success(active ? "Usuario desactivado" : "Usuario activado");
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Nuevo usuario
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Usuario</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Nombre</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Rol</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{u.username}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{u.name ?? "—"}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className={u.role === "SUPERADMIN" ? "bg-blue-100 text-blue-700 border-0" : "bg-slate-100 text-slate-600 border-0"}>
                    {u.role === "SUPERADMIN" ? "SUPERADMIN" : "Empleado"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge className={u.active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                    {u.active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {u.role !== "SUPERADMIN" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggle(u.id, u.active)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {u.active
                        ? <><UserX className="w-4 h-4 mr-1" /> Desactivar</>
                        : <><UserCheck className="w-4 h-4 mr-1" /> Activar</>
                      }
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal crear usuario */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Usuario *</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            </div>
            <div className="space-y-1.5">
              <Label>Nombre (opcional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña temporal *</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Empleado</SelectItem>
                  <SelectItem value="SUPERADMIN">SUPERADMIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createdPassword && (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm">
                <p className="font-medium text-emerald-800">Usuario creado. Contraseña temporal:</p>
                <code className="text-emerald-700 font-mono text-xs">{createdPassword}</code>
                <p className="text-emerald-600 text-xs mt-1">Compártela de forma segura — no se volverá a mostrar.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreatedPassword(null); }}>
              Cerrar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreate} disabled={loading}>
              {loading ? "Creando..." : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
