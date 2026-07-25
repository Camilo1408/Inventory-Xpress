import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canCreateProducts, canEditProducts } from "@/lib/permissions";

// Validación server-side (el cliente ya filtra image/* y 5MB, pero eso es
// bypasseable llamando a la API directo): allowlist de tipos de imagen,
// límite de tamaño real del cuerpo y filename saneado. El blob es público,
// así que sin esto cualquier usuario con permiso de productos podría alojar
// contenido arbitrario o sobrescribir imágenes existentes.
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — mismo límite que el cliente
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Base del filename sin rutas ni caracteres raros, acotada en longitud. */
function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const noExt = base.replace(/\.[^.]*$/, "");
  const clean = noExt.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  return clean || "product-image";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // La subida de imagen ocurre en los formularios de crear/editar producto:
  // usa el mismo permiso granular que esos formularios, no el rol crudo.
  if (!canCreateProducts(session.user) && !canEditProducts(session.user)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido (solo JPEG, PNG, WebP o GIF)" },
      { status: 400 }
    );
  }

  if (!req.body) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  }

  // Leer el cuerpo completo para medir el tamaño REAL (Content-Length es
  // declarativo y puede mentir u omitirse con transfer-encoding chunked).
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  }
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "La imagen no puede superar 5MB" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const filename = sanitizeFilename(searchParams.get("filename") ?? "product-image");

  // addRandomSuffix evita que una subida sobrescriba el blob de otro producto
  // que casualmente (o a propósito) use el mismo nombre de archivo.
  const blob = await put(`products/${filename}.${ext}`, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return NextResponse.json(blob);
}
