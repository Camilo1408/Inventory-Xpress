import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { MovementForm } from "@/components/movements/movement-form";
import { canManageProducts } from "@/lib/permissions";

export default async function MovimientosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const products = await prisma.product.findMany({
    where: { active: true },
    include: { category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const canAdjust = canManageProducts(session.user.role);

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Movimientos</h1>
          <p className="text-slate-500 text-sm mt-1">Registra entradas y salidas de stock</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/movimientos/historial">
            <History className="w-4 h-4 mr-1.5" />
            Historial
          </Link>
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <MovementForm products={products} canAdjust={canAdjust} />
      </div>
    </div>
  );
}
