import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductTable } from "@/components/products/product-table";
import { canManageProducts } from "@/lib/permissions";

export default async function ProductosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const canManage = canManageProducts(session.user.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
          <p className="text-slate-500 text-sm mt-1">Control de stock del inventario</p>
        </div>
        {canManage && (
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link href="/productos/nuevo">
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      <ProductTable products={products} categories={categories} canManage={canManage} />
    </div>
  );
}
