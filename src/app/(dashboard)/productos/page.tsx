import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductTable } from "@/components/products/product-table";
import { canCreateProducts, canEditProducts, canDeleteProducts, canHardDeleteProducts } from "@/lib/permissions";

export default async function ProductosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [products, rootCategories] = await Promise.all([
    prisma.product.findMany({
      include: { category: { select: { id: true, name: true, parentId: true, sortOrder: true } } },
      // Orden: por (sub)categoría según el inventario físico, luego nombre.
      orderBy: [{ active: "desc" }, { category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.category.findMany({
      where: { active: true, parentId: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        children: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
      },
    }),
  ]);

  const canCreate = canCreateProducts(session.user);
  const canManage = canEditProducts(session.user) || canDeleteProducts(session.user);
  const canHardDelete = canHardDeleteProducts(session.user);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Productos</h1>
          <p className="text-slate-500 text-sm mt-1">Control de stock del inventario</p>
        </div>
        {canCreate && (
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link href="/productos/nuevo">
              <Plus className="w-4 h-4 mr-1.5" />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      <ProductTable products={products} rootCategories={rootCategories} canManage={canManage} canHardDelete={canHardDelete} />
    </div>
  );
}
