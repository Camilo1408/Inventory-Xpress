import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const nominaUrl = process.env.NEXT_PUBLIC_NOMINA_APP_URL;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <ShieldOff className="w-8 h-8 text-red-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Acceso denegado</h1>
        <p className="text-slate-500 mb-6 text-sm">
          No tienes permiso para acceder al sistema de inventario. Contacta al administrador.
        </p>
        {nominaUrl && (
          <Button asChild variant="outline">
            <Link href={nominaUrl}>← Volver a Nómina</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
