// src/lib/permissions.ts
// Enforcing granular basado en los permisos que envía Nómina Xpress en el JWT.

import { config } from "@/lib/config";

type SessionUser = {
  role: string;
  inventoryAccess: boolean;
  inventoryPermissions?: string[];
};

/** Claves de permiso del módulo de inventario (contrato con Nómina Xpress). */
export const INV = {
  VIEW: "inventory:view",
  PRODUCTS_CREATE: "inventory:products:create",
  PRODUCTS_EDIT: "inventory:products:edit",
  PRODUCTS_DELETE: "inventory:products:delete",
  PRODUCTS_HARD_DELETE: "inventory:products:hard_delete",
  CATEGORIES_MANAGE: "inventory:categories:manage",
  STOCK_COUNT: "inventory:stock:count",
  STOCK_ADJUST: "inventory:stock:adjust",
  DAILY_REOPEN: "inventory:daily:reopen",
  REPORTS_VIEW: "inventory:reports:view",
  AUDIT_VIEW: "inventory:audit:view",
  USERS_MANAGE: "inventory:users:manage",
} as const;

/** Verificación base: ¿el usuario tiene este permiso granular? */
export function can(user: SessionUser | undefined | null, key: string): boolean {
  if (!user) return false;
  const perms = user.inventoryPermissions ?? [];
  if (perms.includes(key)) return true;
  // Fallback de compatibilidad: si por alguna razón el JWT viejo no trae
  // inventoryPermissions pero sí inventoryAccess, concede el baseline operativo.
  if (perms.length === 0 && user.inventoryAccess) {
    return key === INV.VIEW || key === INV.STOCK_COUNT;
  }
  return false;
}

/** ¿Puede acceder al inventario? (gate del middleware) */
export function canAccessInventory(user: SessionUser): boolean {
  return user.inventoryAccess === true || (user.inventoryPermissions?.length ?? 0) > 0;
}

/** Crear productos. */
export function canCreateProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_CREATE);
}

/** Editar productos. */
export function canEditProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_EDIT);
}

/** Eliminar/desactivar productos. */
export function canDeleteProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_DELETE);
}

/**
 * Borrado PERMANENTE de productos (no solo desactivar). Gobernado por su propia
 * clave de permiso. El borrado solo procede si el producto no tiene historial
 * (se valida en la API).
 */
export function canHardDeleteProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_HARD_DELETE);
}

/** Gestionar categorías. */
export function canManageCategories(user: SessionUser): boolean {
  return can(user, INV.CATEGORIES_MANAGE);
}

/** Registrar movimientos / inventario diario. */
export function canDoStockCount(user: SessionUser): boolean {
  return can(user, INV.STOCK_COUNT);
}

/** Ajustes manuales de stock (tipo ADJUSTMENT). */
export function canAdjustStock(user: SessionUser): boolean {
  return can(user, INV.STOCK_ADJUST);
}

/** Reabrir inventario diario cerrado. */
export function canReopenDailyInventory(user: SessionUser): boolean {
  return can(user, INV.DAILY_REOPEN);
}

/** Ver reportes de inventario. */
export function canViewReports(user: SessionUser): boolean {
  return can(user, INV.REPORTS_VIEW);
}

/** Gestionar usuarios y roles del inventario (solo modo standalone). */
export function canManageUsers(user: SessionUser): boolean {
  return can(user, INV.USERS_MANAGE);
}

/** Ver el módulo de auditoría. */
export function canViewAudit(user: SessionUser): boolean {
  return can(user, INV.AUDIT_VIEW);
}

// ─── Permisos por categoría de inventario diario ─────────────────────────────
// Contrato con Nómina: claves basadas en el slug de la categoría raíz.
//   inventory:daily:<slug>:view | open | close | edit | history

export type DailyAction = "view" | "open" | "close" | "edit" | "history";

const ADMIN_ROLES = ["PROPRIETARY", "SUPERADMIN", "ADMIN"];

/** Clave de permiso para una acción sobre el inventario diario de una categoría. */
export function dailyCategoryKey(slug: string, action: DailyAction): string {
  return `inventory:daily:${slug}:${action}`;
}

/** Las 5 claves de permiso que se registran al crear una categoría de inventario. */
export function dailyCategoryKeys(slug: string): string[] {
  return (["view", "open", "close", "edit", "history"] as DailyAction[]).map((a) =>
    dailyCategoryKey(slug, a)
  );
}

/**
 * ¿Puede el usuario realizar `action` sobre el inventario diario de la categoría `slug`?
 *
 * MODO INTEGRADO (Nómina emite `inventoryPermissions`): la fuente de verdad es
 * **siempre** la clave por categoría. No hay fallback a claves globales — en
 * particular `inventory:stock:count`, que Nómina incluye en el JWT de cualquier
 * empleado con acceso al inventario, NO concede ninguna categoría (antes las
 * concedía todas). `stock:count` solo habilita la pantalla de Movimientos.
 *
 * MODO STANDALONE (sin Nómina): no existen claves por categoría en el catálogo
 * local, así que se concede por rol/claves globales, como hasta ahora:
 * PROPRIETARY/SUPERADMIN/ADMIN operan todas las categorías y EMPLOYEE conserva
 * abrir/cerrar. "edit" = reabrir, exige DAILY_REOPEN explícito.
 */
export function canDailyCategory(user: SessionUser | null | undefined, slug: string, action: DailyAction): boolean {
  if (!user) return false;
  if (can(user, dailyCategoryKey(slug, action))) return true;

  // Integrado: sin fallback. Falta la clave por categoría → denegado.
  if (config.authMode !== "standalone") return false;

  if (isAdminRole(user)) return true;

  switch (action) {
    case "view":  return can(user, INV.VIEW);
    case "open":  return can(user, INV.STOCK_COUNT);
    case "close": return can(user, INV.STOCK_COUNT);
    case "edit":  return can(user, INV.DAILY_REOPEN);
    case "history": return false;
  }
}

export const canViewDailyCategory  = (u: SessionUser, slug: string) => canDailyCategory(u, slug, "view");
export const canOpenDailyCategory  = (u: SessionUser, slug: string) => canDailyCategory(u, slug, "open");
export const canCloseDailyCategory = (u: SessionUser, slug: string) => canDailyCategory(u, slug, "close");
export const canEditDailyCategory  = (u: SessionUser, slug: string) => canDailyCategory(u, slug, "edit");
export const canViewDailyHistory   = (u: SessionUser, slug: string) => canDailyCategory(u, slug, "history");

/** ¿Es un rol administrativo? Usado para gates del módulo de auditoría. */
export function isAdminRole(user: SessionUser): boolean {
  return ADMIN_ROLES.includes(user.role);
}

// Solo estos roles pueden descartar una jornada abierta o corregir su conteo
// inicial. A propósito NO incluye ADMIN (a diferencia de `ADMIN_ROLES`): es una
// acción destructiva/correctiva reservada a dueño y superadmin.
const MANAGE_OPEN_DAILY_ROLES = ["PROPRIETARY", "SUPERADMIN"];

/** ¿Puede descartar/editar el inicio de un inventario diario ABIERTO? */
export function canManageOpenDaily(user: SessionUser | null | undefined): boolean {
  return !!user && MANAGE_OPEN_DAILY_ROLES.includes(user.role);
}
