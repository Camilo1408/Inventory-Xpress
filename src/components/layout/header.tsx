"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, User, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  userName: string;
  role: string;
  isStandalone: boolean;
  nominaUrl?: string;
  onMenuClick?: () => void;
}

export function Header({ userName, role, isStandalone, nominaUrl, onMenuClick }: HeaderProps) {
  const handleLogout = async () => {
    if (!isStandalone && nominaUrl) {
      window.location.href = `${nominaUrl}/api/auth/signout`;
    } else {
      await signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between gap-2 px-4 sm:px-6 shrink-0">
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden -ml-1 p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto min-w-0">
        {isStandalone ? (
          <Link
            href="/perfil"
            title="Mi perfil"
            className="flex items-center gap-2 text-sm min-w-0 rounded-md px-2 py-1 -mx-1 hover:bg-slate-100 transition-colors"
          >
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-slate-700 font-medium truncate max-w-[40vw] sm:max-w-none">{userName}</span>
            <span className="hidden sm:inline text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
              {role}
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-slate-700 font-medium truncate max-w-[40vw] sm:max-w-none">{userName}</span>
            <span className="hidden sm:inline text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
              {role}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-slate-500 hover:text-slate-700 shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
