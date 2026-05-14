import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { canManageProducts } from "@/lib/permissions";
import { ProductForm } from "@/components/products/product-form";

export default async function NuevoProductoPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canManageProducts(session.user.role)) redirect("/productos");

  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Nuevo producto</h1>
        <p className="text-slate-500 text-sm mt-1">Agrega un producto al inventario</p>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
