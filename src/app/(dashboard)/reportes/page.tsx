import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canViewReports } from "@/lib/permissions";
import { ReportesClient } from "./reportes-client";

export default async function ReportesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canViewReports(session.user)) redirect("/");

  // Solo categorías raíz (sin padre) para el filtro de categoría
  const categories = await prisma.category.findMany({
    where: { active: true, parentId: null },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="text-slate-500 text-sm mt-1">Reporte de inventario por período</p>
      </div>
      <ReportesClient categories={categories} />
    </div>
  );
}
