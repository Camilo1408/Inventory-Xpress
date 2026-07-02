"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, User } from "lucide-react";
import { toast } from "sonner";

interface Props {
  username: string;
  name: string;
  role: string;
}

function PasswordInput({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
        aria-label={show ? "Ocultar" : "Mostrar"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function PerfilClient({ username, name, role }: Props) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Ingresa tu contraseña actual");
      return;
    }
    if (!newUsername.trim() && !newPassword) {
      toast.error("No hay cambios para guardar");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newUsername: newUsername.trim() || undefined,
        newPassword: newPassword || undefined,
      }),
    });
    setLoading(false);
    const data = await res.json().catch(() => null) as { error?: string } | null;
    if (res.ok) {
      toast.success("Cambios guardados");
      setCurrentPassword("");
      setNewUsername("");
      setNewPassword("");
      router.refresh();
    } else {
      toast.error(data?.error ?? "No se pudieron guardar los cambios");
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6">
      {/* Cabecera con identidad actual */}
      <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 truncate">{name}</span>
            <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">{role}</Badge>
          </div>
          <p className="text-xs text-slate-400">@{username}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Contraseña actual *</Label>
          <PasswordInput value={currentPassword} onChange={setCurrentPassword} placeholder="Tu contraseña actual" />
        </div>

        <div className="space-y-1.5">
          <Label>Nuevo usuario</Label>
          <Input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Dejar vacío para no cambiar"
            autoComplete="off"
          />
          <p className="text-xs text-slate-400">Mínimo 3 caracteres, sin espacios.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Nueva contraseña</Label>
          <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Dejar vacío para no cambiar" />
          <p className="text-xs text-slate-400">Mínimo 6 caracteres si la cambias.</p>
        </div>

        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>
    </div>
  );
}
