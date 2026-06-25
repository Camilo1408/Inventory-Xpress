// src/lib/permissions.ts
// Enforcing granular basado en los permisos que envía Nómina Xpress en el JWT.

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
  CATEGORIES_MANAGE: "inventory:categories:manage",
  STOCK_COUNT: "inventory:stock:count",
  STOCK_ADJUST: "inventory:stock:adjust",
  DAILY_REOPEN: "inventory:daily:reopen",
  REPORTS_VIEW: "inventory:reports:view",
  USERS_MANAGE: "inventory:users:manage",
} as const;

/**
 * Permisos por defecto para un rol en modo standalone, donde no existe Nómina
 * Xpress que emita `inventoryPermissions` en el JWT. Reproduce el contrato:
 * roles administrativos obtienen los 10 permisos; el resto, el baseline operativo.
 */
export function standalonePermissions(role: string): string[] {
  if (role === "SUPERADMIN" || role === "ADMIN" || role === "PROPRIETARY") {
    return Object.values(INV);
  }
  return [INV.VIEW, INV.STOCK_COUNT];
}

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
 * Borrado PERMANENTE de productos (no solo desactivar). Restringido a los roles
 * de mayor jerarquía: SUPERADMIN y PROPRIETARY. Requiere además el permiso de
 * eliminación. El borrado solo procede si el producto no tiene historial (se valida
 * en la API).
 */
export function canHardDeleteProducts(user: SessionUser): boolean {
  return (user.role === "SUPERADMIN" || user.role === "PROPRIETARY") && canDeleteProducts(user);
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

/** Gestionar usuarios del inventario (solo modo standalone). */
export function canManageUsers(user: SessionUser): boolean {
  return can(user, INV.USERS_MANAGE);
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
 * Orden de evaluación:
 *  1. Clave granular emitida por Nómina (fuente real en modo integrado).
 *  2. Modo standalone: PROPRIETARY/SUPERADMIN/ADMIN tienen acceso total por rol
 *     (sin necesidad de re-login cuando se crean nuevas categorías).
 *  3. Fallback transicional: la clave global vieja (`inventory:stock:count`)
 *     concede operación mientras Nómina aún no emite las claves por categoría.
 */
export function canDailyCategory(user: SessionUser | null | undefined, slug: string, action: DailyAction): boolean {
  if (!user) return false;
  if (can(user, dailyCategoryKey(slug, action))) return true;

  const isStandalone = process.env.AUTH_MODE === "standalone";
  if (isStandalone && ADMIN_ROLES.includes(user.role)) return true;

  // Compatibilidad con sesiones/JWT previos a la separación por categoría.
  const perms = user.inventoryPermissions ?? [];
  if (perms.includes(INV.STOCK_COUNT)) return action !== "history";
  if (perms.length === 0 && user.inventoryAccess) return action === "view" || action === "open" || action === "close";

  return false;
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
