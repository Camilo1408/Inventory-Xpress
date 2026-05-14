"use client";

import { signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  userName: string;
  role: string;
  isStandalone: boolean;
  nominaUrl?: string;
}

export function Header({ userName, role, isStandalone, nominaUrl }: HeaderProps) {
  const handleLogout = async () => {
    if (!isStandalone && nominaUrl) {
      window.location.href = `${nominaUrl}/api/auth/signout`;
    } else {
      await signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700 font-medium">{userName}</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {role}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-slate-500 hover:text-slate-700"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
