export function canManageProducts(role: string): boolean {
  return role === "SUPERADMIN";
}

export function canDoStockCount(role: string, inventoryAccess: boolean): boolean {
  return role === "SUPERADMIN" || inventoryAccess === true;
}

export function canManageUsers(role: string): boolean {
  return role === "SUPERADMIN";
}

/** Usuario con solo permiso operativo de inventario (no SUPERADMIN). */
export function isInventoryOnlyUser(role: string, inventoryAccess: boolean): boolean {
  return role !== "SUPERADMIN" && inventoryAccess === true;
}
