/** Puede crear, editar y eliminar productos y categorías. */
export function canManageProducts(role: string): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}

/** Puede registrar movimientos de stock e inventario diario. */
export function canDoStockCount(role: string, inventoryAccess: boolean): boolean {
  return role === "SUPERADMIN" || role === "ADMIN" || inventoryAccess === true;
}

/** Puede gestionar usuarios (solo modo standalone). */
export function canManageUsers(role: string): boolean {
  return role === "SUPERADMIN";
}

/** Usuario con solo permiso operativo (EMPLOYEE con inventoryAccess, no ADMIN ni SUPERADMIN). */
export function isInventoryOnlyUser(role: string, inventoryAccess: boolean): boolean {
  return role !== "SUPERADMIN" && role !== "ADMIN" && inventoryAccess === true;
}
