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
  ClipboardList,
  ScrollText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  alertCount: number;
  isStandalone: boolean;
  nominaUrl?: string;
  canManageCategories?: boolean;
  canManageUsers?: boolean;
  canViewAudit?: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}

const baseNavItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/productos", icon: Package, label: "Productos" },
  { href: "/movimientos", icon: ArrowLeftRight, label: "Movimientos" },
  { href: "/inventario-diario", icon: ClipboardList, label: "Inventario Diario" },
  { href: "/alertas", icon: Bell, label: "Alertas" },
  { href: "/reportes", icon: BarChart3, label: "Reportes" },
];

const adminOnlyItems = [
  { href: "/admin/categorias", icon: Tags, label: "Categorías" },
];

const auditItems = [
  { href: "/auditoria", icon: ScrollText, label: "Auditoría" },
];

const standaloneOnlyItems = [
  { href: "/admin/usuarios", icon: Users, label: "Usuarios" },
];

export function Sidebar({ alertCount, isStandalone, nominaUrl, canManageCategories, canManageUsers, canViewAudit, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    ...baseNavItems,
    ...(canManageCategories ? adminOnlyItems : []),
    ...(canViewAudit ? auditItems : []),
    ...(isStandalone && canManageUsers ? standaloneOnlyItems : []),
  ];

  return (
    <aside
      className={cn(
        "w-60 bg-white border-r border-slate-200 flex flex-col shrink-0",
        // En móvil: drawer fuera de pantalla; en lg+: columna estática
        "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out",
        "lg:static lg:translate-x-0 lg:z-auto",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="p-6 border-b border-slate-200 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Inventario</h1>
          <p className="text-xs text-slate-500 mt-0.5">Gestión de stock</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden -mr-1 -mt-1 p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
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
              onClick={onClose}
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
