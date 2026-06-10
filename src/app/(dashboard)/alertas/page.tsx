import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AlertasClient } from "./alertas-client";

export default async function AlertasPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const products = await prisma.product.findMany({
    where: { active: true, minStock: { gt: 0 } },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const alerts = products
    .filter((p) => p.currentStock <= p.minStock)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock,
      minStock: p.minStock,
      deficit: p.minStock - p.currentStock,
      quantityToOrder: p.minStock * 2 - p.currentStock,
      category: p.category?.name ?? "Sin categoría",
    }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Alertas de stock</h1>
        <p className="text-slate-500 text-sm mt-1">
          {alerts.length > 0
            ? `${alerts.length} producto${alerts.length !== 1 ? "s" : ""} bajo el stock mínimo`
            : "Todo el stock está en orden"}
        </p>
      </div>
      <AlertasClient alerts={alerts} />
    </div>
  );
}
