// src/lib/permission-registry.ts
// Registro de claves de permiso del módulo de inventario, para que Nómina Xpress
// las espeje y las asigne automáticamente a los roles.
//
// - Claves globales: las 10 acciones del módulo (contrato fijo).
// - Claves por categoría: 5 acciones por cada categoría RAÍZ de inventario,
//   derivadas de su slug (`inventory:daily:<slug>:<acción>`). Las subcategorías
//   NO tienen claves propias: heredan de su categoría raíz.

import { INV, dailyCategoryKeys } from "@/lib/permissions";

/** Roles a los que Nómina debe asignar por defecto las claves nuevas de categoría. */
export const DEFAULT_GRANT_ROLES = ["PROPRIETARY", "SUPERADMIN", "ADMIN"] as const;

export interface CategoryPermissionEntry {
  slug: string;
  name: string;
  keys: string[];
}

export interface PermissionRegistry {
  global: string[];
  categories: CategoryPermissionEntry[];
  defaultGrantRoles: readonly string[];
}

/** Construye el registro completo a partir de las categorías raíz (con slug). */
export function buildPermissionRegistry(
  roots: { slug: string | null; name: string }[]
): PermissionRegistry {
  return {
    global: Object.values(INV),
    categories: roots
      .filter((c): c is { slug: string; name: string } => !!c.slug)
      .map((c) => ({ slug: c.slug, name: c.name, keys: dailyCategoryKeys(c.slug) })),
    defaultGrantRoles: DEFAULT_GRANT_ROLES,
  };
}

/**
 * Notifica a Nómina (best-effort) que se creó una categoría raíz, para que registre
 * sus claves y las asigne a los roles por defecto. No bloquea ni falla la creación
 * si Nómina no responde: el endpoint de registro permite reconciliar después.
 *
 * Configurar con env `NOMINA_PERMISSION_SYNC_URL` (y opcional `NOMINA_SYNC_SECRET`).
 */
export async function notifyNominaCategoryCreated(entry: CategoryPermissionEntry): Promise<void> {
  const url = process.env.NOMINA_PERMISSION_SYNC_URL;
  if (!url) return; // sync por push deshabilitado; Nómina puede usar el endpoint de registro (pull)
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NOMINA_SYNC_SECRET ? { "x-sync-secret": process.env.NOMINA_SYNC_SECRET } : {}),
      },
      body: JSON.stringify({
        event: "inventory.category.created",
        category: { slug: entry.slug, name: entry.name },
        keys: entry.keys,
        assignToRoles: DEFAULT_GRANT_ROLES,
      }),
    });
  } catch {
    // best-effort: se ignora; la reconciliación vía GET /api/inventory-permissions cubre el caso.
  }
}
