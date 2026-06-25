"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";

interface Props {
  users: string[];
  actions: { value: string; label: string }[];
  current: {
    q?: string;
    user?: string;
    action?: string;
    result?: string;
    from?: string;
    to?: string;
  };
}

export function AuditFilters({ users, actions, current }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const [user, setUser] = useState(current.user ?? "all");
  const [action, setAction] = useState(current.action ?? "all");
  const [result, setResult] = useState(current.result ?? "all");
  const [from, setFrom] = useState(current.from ?? "");
  const [to, setTo] = useState(current.to ?? "");

  function apply() {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (user !== "all") p.set("user", user);
    if (action !== "all") p.set("action", action);
    if (result !== "all") p.set("result", result);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    router.push(qs ? `/auditoria?${qs}` : "/auditoria");
  }

  function clear() {
    setQ(""); setUser("all"); setAction("all"); setResult("all"); setFrom(""); setTo("");
    router.push("/auditoria");
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Buscar por descripción, categoría o usuario..."
          className="h-10 pl-9 pr-3 w-full rounded-md border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Usuario</Label>
          <Select value={user} onValueChange={setUser}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Tipo de acción</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {actions.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Resultado</Label>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="success">Exitosa</SelectItem>
              <SelectItem value="denied">Denegado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={apply} className="bg-blue-600 hover:bg-blue-700">
          <Search className="w-4 h-4 mr-1.5" />
          Filtrar
        </Button>
        <Button variant="outline" onClick={clear}>
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Limpiar
        </Button>
      </div>
    </div>
  );
}
