"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Bell,
  BarChart3,
  Tags,
  Users,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  alertCount: number;
  isStandalone: boolean;
  nominaUrl?: string;
}

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/productos", icon: Package, label: "Productos" },
  { href: "/movimientos", icon: ArrowLeftRight, label: "Movimientos" },
  { href: "/alertas", icon: Bell, label: "Alertas" },
  { href: "/reportes", icon: BarChart3, label: "Reportes" },
  { href: "/admin/categorias", icon: Tags, label: "Categorías" },
];

const standaloneOnlyItems = [
  { href: "/admin/usuarios", icon: Users, label: "Usuarios" },
];

export function Sidebar({ alertCount, isStandalone, nominaUrl }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-6 border-b border-slate-200">
        <h1 className="text-lg font-bold text-slate-900">Inventario</h1>
        <p className="text-xs text-slate-500 mt-0.5">Gestión de stock</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/alertas" && alertCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700 border-0 text-xs px-1.5 py-0">
                  {alertCount}
                </Badge>
              )}
            </Link>
          );
        })}

        {isStandalone && standaloneOnlyItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {!isStandalone && nominaUrl && (
        <div className="p-3 border-t border-slate-200">
          <a
            href={nominaUrl}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Volver a Nómina
          </a>
        </div>
      )}
    </aside>
  );
}
