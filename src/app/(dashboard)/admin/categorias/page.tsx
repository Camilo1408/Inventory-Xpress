import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canManageProducts } from "@/lib/permissions";
import { CategoriasClient } from "./categorias-client";

export default async function CategoriasPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canManageProducts(session.user.role)) redirect("/");

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Categorías</h1>
        <p className="text-slate-500 text-sm mt-1">Administra las categorías de productos</p>
      </div>
      <CategoriasClient categories={categories} />
    </div>
  );
}
