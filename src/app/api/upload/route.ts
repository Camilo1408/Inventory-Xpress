import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreateProducts, canEditProducts } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // La subida de imagen ocurre en los formularios de crear/editar producto:
  // usa el mismo permiso granular que esos formularios, no el rol crudo.
  if (!canCreateProducts(session.user) && !canEditProducts(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename") ?? "product-image";

  if (!req.body) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  }

  const blob = await put(`products/${filename}`, req.body, { access: "public" });
  return NextResponse.json(blob);
}
