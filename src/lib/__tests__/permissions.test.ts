// RN-I07: toda acción se autoriza por clave `inventory:*` del JWT, nunca por rol literal.
// Las excepciones por rol son explícitas y están acotadas; aquí quedan fijadas.

import { beforeEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({ authMode: "integrated" as "integrated" | "standalone" }));
vi.mock("@/lib/config", () => ({ config: cfg }));

import {
  INV,
  can,
  canAccessInventory,
  canAdjustStock,
  canCreateProducts,
  canDailyCategory,
  canDeleteProducts,
  canDoStockCount,
  canEditMovements,
  canEditProducts,
  canHardDeleteProducts,
  canManageCategories,
  canManageUsers,
  canReopenDailyInventory,
  canViewAudit,
  canViewReports,
  dailyCategoryKey,
  dailyCategoryKeys,
  type DailyAction,
} from "../permissions";

const user = (inventoryPermissions: string[], role = "EMPLOYEE", inventoryAccess = true) => ({
  role,
  inventoryAccess,
  inventoryPermissions,
});

const ACTIONS: DailyAction[] = ["view", "open", "close", "edit", "history"];

beforeEach(() => {
  cfg.authMode = "integrated";
});

describe("claves globales", () => {
  const helpers = [
    [INV.PRODUCTS_CREATE, canCreateProducts],
    [INV.PRODUCTS_EDIT, canEditProducts],
    [INV.PRODUCTS_DELETE, canDeleteProducts],
    [INV.PRODUCTS_HARD_DELETE, canHardDeleteProducts],
    [INV.CATEGORIES_MANAGE, canManageCategories],
    [INV.STOCK_COUNT, canDoStockCount],
    [INV.STOCK_ADJUST, canAdjustStock],
    [INV.DAILY_REOPEN, canReopenDailyInventory],
    [INV.REPORTS_VIEW, canViewReports],
    [INV.AUDIT_VIEW, canViewAudit],
    [INV.USERS_MANAGE, canManageUsers],
  ] as const;

  it.each(helpers)("[RN-I07] %s: concede con la clave y niega sin ella", (key, helper) => {
    expect(helper(user([key]))).toBe(true);
    expect(helper(user([INV.VIEW]))).toBe(false);
  });

  it.each(helpers)("[RN-I07] %s: el rol no sustituye a la clave, ni siquiera PROPRIETARY", (_key, helper) => {
    for (const role of ["PROPRIETARY", "SUPERADMIN", "ADMIN"]) {
      expect(helper(user([INV.VIEW], role))).toBe(false);
    }
  });

  it("[NEG] sin usuario no se concede nada", () => {
    expect(can(null, INV.VIEW)).toBe(false);
    expect(can(undefined, INV.STOCK_COUNT)).toBe(false);
  });

  it("[LIM] un JWT viejo sin lista de permisos conserva solo ver y registrar movimientos", () => {
    const viejo = user([]);
    expect(can(viejo, INV.VIEW)).toBe(true);
    expect(can(viejo, INV.STOCK_COUNT)).toBe(true);
    expect(can(viejo, INV.STOCK_ADJUST)).toBe(false);
    expect(can(viejo, INV.PRODUCTS_EDIT)).toBe(false);
    expect(can(user([], "EMPLOYEE", false), INV.VIEW)).toBe(false);
  });

  it("canAccessInventory: basta el acceso o al menos una clave", () => {
    expect(canAccessInventory(user([]))).toBe(true);
    expect(canAccessInventory(user([INV.VIEW], "EMPLOYEE", false))).toBe(true);
    expect(canAccessInventory(user([], "EMPLOYEE", false))).toBe(false);
  });
});

describe("canEditMovements (RN-I08)", () => {
  it("[RN-I08] concede por la clave a cualquier rol", () => {
    expect(canEditMovements(user([INV.MOVEMENTS_EDIT]))).toBe(true);
    expect(canEditMovements(user([INV.MOVEMENTS_EDIT], "ADMIN"))).toBe(true);
  });

  it("[RN-I08] sin la clave solo PROPRIETARY y SUPERADMIN; al ADMIN se le puede revocar", () => {
    expect(canEditMovements(user([INV.VIEW], "PROPRIETARY"))).toBe(true);
    expect(canEditMovements(user([INV.VIEW], "SUPERADMIN"))).toBe(true);
    expect(canEditMovements(user([INV.VIEW, INV.STOCK_ADJUST], "ADMIN"))).toBe(false);
    expect(canEditMovements(user([INV.VIEW, INV.STOCK_COUNT], "EMPLOYEE"))).toBe(false);
  });
});

describe("permisos por categoría del inventario diario", () => {
  it("las claves siguen el contrato con Nómina: inventory:daily:<slug>:<acción>", () => {
    expect(dailyCategoryKey("cocina", "close")).toBe("inventory:daily:cocina:close");
    expect(dailyCategoryKeys("barra")).toEqual(ACTIONS.map((a) => `inventory:daily:barra:${a}`));
  });

  it.each(ACTIONS)("[RN-I07] «%s» se concede solo con la clave de esa categoría y acción", (action) => {
    const u = user([INV.VIEW, dailyCategoryKey("cocina", action)]);
    expect(canDailyCategory(u, "cocina", action)).toBe(true);
    expect(canDailyCategory(u, "barra", action)).toBe(false);
    for (const otra of ACTIONS.filter((a) => a !== action)) {
      expect(canDailyCategory(u, "cocina", otra)).toBe(false);
    }
  });

  it("[RN-I07] integrado: las claves globales no conceden ninguna categoría", () => {
    const u = user([INV.VIEW, INV.STOCK_COUNT, INV.STOCK_ADJUST, INV.DAILY_REOPEN]);
    for (const action of ACTIONS) expect(canDailyCategory(u, "cocina", action)).toBe(false);
  });

  it.each(["PROPRIETARY", "SUPERADMIN", "ADMIN"])("%s opera cualquier categoría sin la clave (fallback por rol)", (role) => {
    for (const action of ACTIONS) expect(canDailyCategory(user([INV.VIEW], role), "categoria-nueva", action)).toBe(true);
  });

  it("[NEG] sin usuario se niega", () => {
    expect(canDailyCategory(null, "cocina", "view")).toBe(false);
  });

  it("standalone: sin claves por categoría, se concede por las claves globales", () => {
    cfg.authMode = "standalone";
    const empleado = user([INV.VIEW, INV.STOCK_COUNT]);
    expect(canDailyCategory(empleado, "cocina", "view")).toBe(true);
    expect(canDailyCategory(empleado, "cocina", "open")).toBe(true);
    expect(canDailyCategory(empleado, "cocina", "close")).toBe(true);
    expect(canDailyCategory(empleado, "cocina", "edit")).toBe(false);
    expect(canDailyCategory(empleado, "cocina", "history")).toBe(false);
    expect(canDailyCategory(user([INV.VIEW, INV.DAILY_REOPEN]), "cocina", "edit")).toBe(true);
  });
});
