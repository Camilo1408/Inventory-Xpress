import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { canManageProducts } from "@/lib/permissions";
import { ProductForm } from "@/components/products/product-form";

export default async function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canManageProducts(session.user.role)) redirect("/productos");

  const { id } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({
      where: { active: true, parentId: null },
      orderBy: { name: "asc" },
      include: { children: { where: { active: true }, orderBy: { name: "asc" } } },
    }),
  ]);

  if (!product) notFound();

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Editar producto</h1>
        <p className="text-slate-500 text-sm mt-1">{product.name}</p>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <ProductForm
          categories={categories}
          initialData={{
            id: product.id,
            name: product.name,
            categoryId: product.categoryId,
            unit: product.unit,
            minStock: product.minStock,
            imageUrl: product.imageUrl,
          }}
        />
      </div>
    </div>
  );
}
