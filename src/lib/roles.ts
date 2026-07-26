// src/lib/roles.ts
// Catálogo de permisos del módulo de inventario y presets de roles base.
// Compartido por la resolución de permisos (auth) y la UI de roles/usuarios.

import { INV } from "@/lib/permissions";

/** Rol base del sistema (modo standalone). */
export type BaseRole = "SUPERADMIN" | "ADMIN" | "EMPLOYEE";

export const BASE_ROLES: readonly BaseRole[] = ["SUPERADMIN", "ADMIN", "EMPLOYEE"];

export function isBaseRole(v: unknown): v is BaseRole {
  return typeof v === "string" && (BASE_ROLES as readonly string[]).includes(v);
}

/** Etiquetas legibles de cada rol base. */
export const BASE_ROLE_LABEL: Record<BaseRole, string> = {
  SUPERADMIN: "Superadmin",
  ADMIN: "Admin",
  EMPLOYEE: "Empleado",
};

export const BASE_ROLE_DESCRIPTION: Record<BaseRole, string> = {
  SUPERADMIN: "Acceso completo. Gestiona productos, categorías, usuarios, roles y auditoría.",
  ADMIN: "Opera todo el inventario, pero no crea/edita productos ni categorías, ni gestiona usuarios.",
  EMPLOYEE: "Inventario diario, movimientos, ver productos, ver alertas y dashboard.",
};

// ─── Catálogo de permisos (agrupado para la UI) ──────────────────────────────

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
  group: string;
}

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  { key: INV.VIEW,                 group: "General",   label: "Ver inventario",        description: "Dashboard, ver productos y ver alertas (baseline)." },
  { key: INV.STOCK_COUNT,          group: "Operación", label: "Registrar movimientos", description: "Entradas/salidas e inventario diario." },
  { key: INV.STOCK_ADJUST,         group: "Operación", label: "Ajustar stock",         description: "Ajustes manuales de stock (tipo ADJUSTMENT)." },
  { key: INV.MOVEMENTS_EDIT,       group: "Operación", label: "Corregir movimientos",  description: "Editar cantidad/notas o eliminar movimientos manuales ya registrados." },
  { key: INV.DAILY_REOPEN,         group: "Operación", label: "Reabrir inventario",    description: "Reabrir un inventario diario ya cerrado." },
  { key: INV.REPORTS_VIEW,         group: "Operación", label: "Ver reportes",          description: "Reportes de inventario por período." },
  { key: INV.PRODUCTS_CREATE,      group: "Productos", label: "Crear productos",       description: "Alta de nuevos productos." },
  { key: INV.PRODUCTS_EDIT,        group: "Productos", label: "Editar productos",      description: "Modificar productos existentes." },
  { key: INV.PRODUCTS_DELETE,      group: "Productos", label: "Activar/desactivar",    description: "Desactivar o reactivar productos." },
  { key: INV.PRODUCTS_HARD_DELETE, group: "Productos", label: "Borrado permanente",    description: "Eliminar productos sin historial de forma irreversible." },
  { key: INV.CATEGORIES_MANAGE,    group: "Productos", label: "Gestionar categorías",  description: "Crear y editar categorías." },
  { key: INV.AUDIT_VIEW,           group: "Admin",     label: "Ver auditoría",         description: "Registro de acciones del módulo." },
  { key: INV.USERS_MANAGE,         group: "Admin",     label: "Gestionar usuarios",    description: "Crear/editar usuarios, roles y permisos." },
] as const;

/** Todas las claves válidas del catálogo (para validación). */
export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.map((p) => p.key);
const PERMISSION_KEY_SET = new Set(ALL_PERMISSION_KEYS);

export function isPermissionKey(v: unknown): v is string {
  return typeof v === "string" && PERMISSION_KEY_SET.has(v);
}

/** Filtra un arreglo dejando solo claves de permiso válidas y sin duplicados. */
export function sanitizePermissionKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.filter(isPermissionKey))];
}

// ─── Presets de roles base → conjunto de permisos ────────────────────────────

const EMPLOYEE_PERMS: string[] = [INV.VIEW, INV.STOCK_COUNT];

const ADMIN_PERMS: string[] = [
  INV.VIEW,
  INV.STOCK_COUNT,
  INV.STOCK_ADJUST,
  INV.MOVEMENTS_EDIT, // revocable por rol/overrides desde la UI de roles
  INV.DAILY_REOPEN,
  INV.REPORTS_VIEW,
  INV.PRODUCTS_DELETE, // activar/desactivar, pero no crear/editar/borrado permanente
  INV.AUDIT_VIEW,
];

const SUPERADMIN_PERMS: string[] = [...ALL_PERMISSION_KEYS];

export const BASE_ROLE_PERMISSIONS: Record<BaseRole, string[]> = {
  SUPERADMIN: SUPERADMIN_PERMS,
  ADMIN: ADMIN_PERMS,
  EMPLOYEE: EMPLOYEE_PERMS,
};

/** Permisos del rol base (por defecto EMPLOYEE si el rol es desconocido). */
export function baseRolePermissions(role: string): string[] {
  return isBaseRole(role) ? [...BASE_ROLE_PERMISSIONS[role]] : [...EMPLOYEE_PERMS];
}

// ─── Resolución de permisos efectivos ────────────────────────────────────────

/** Parsea un JSON string[] guardado en DB; tolera nulos/valores corruptos. */
export function parsePermissionsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return sanitizePermissionKeys(parsed);
  } catch {
    return [];
  }
}

export interface ResolvableUser {
  role: string;
  active?: boolean;
  customRole?: { permissions: string; active: boolean } | null;
  permsGrant?: string | null;
  permsRevoke?: string | null;
}

/**
 * Permisos efectivos de un usuario:
 *   - SUPERADMIN siempre obtiene todo (a prueba de bloqueo).
 *   - Usuario inactivo → sin permisos.
 *   - Fuente = rol personalizado activo (reemplaza) o rol base.
 *   - efectivos = (fuente ∪ grant) − revoke.
 */
export function resolveUserPermissions(user: ResolvableUser): string[] {
  if (user.active === false) return [];
  if (user.role === "SUPERADMIN") return [...ALL_PERMISSION_KEYS];

  const source =
    user.customRole && user.customRole.active
      ? parsePermissionsJson(user.customRole.permissions)
      : baseRolePermissions(user.role);

  const grant  = parsePermissionsJson(user.permsGrant);
  const revoke = new Set(parsePermissionsJson(user.permsRevoke));

  const effective = new Set<string>([...source, ...grant]);
  for (const r of revoke) effective.delete(r);

  return [...effective];
}
