// RN-I06: un producto entra en alerta cuando `currentStock ≤ minStock` (con mínimo definido).
// Contra una SQLite real (ver src/test/db.ts).

import { jsonRequest, testUser } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: ReturnType<typeof testUser> | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import { GET as getAlerts } from "../alerts/route";
import { GET as getShoppingList } from "../alerts/shopping-list/route";

type Alert = { product: { name: string }; currentStock: number; minStock: number; deficit: number };
type ListRow = Alert & { quantityToOrder: number };

const alerts = async (query = ""): Promise<Alert[]> =>
  (await (await getAlerts(jsonRequest("GET", undefined, `http://localhost/api/alerts${query}`))).json()).alerts;

let cocina: { id: string };
let barra: { id: string };

beforeEach(async () => {
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  cocina = await prisma.category.create({ data: { name: "Cocina", slug: "cocina" } });
  barra = await prisma.category.create({ data: { name: "Barra", slug: "barra" } });
  const p = (name: string, currentStock: number, minStock: number, extra: Record<string, unknown> = {}) =>
    prisma.product.create({ data: { name, unit: "kg", currentStock, minStock, categoryId: cocina.id, ...extra } });

  await p("Bajo el mínimo", 2, 5);
  await p("Justo en el mínimo", 5, 5);
  await p("Sobre el mínimo", 5.01, 5);
  await p("Sin mínimo y agotado", 0, 0);
  await p("Inactivo y agotado", 0, 5, { active: false });
  await p("Agotado de barra", 0, 3, { categoryId: barra.id });
  session = testUser(["inventory:view"]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/alerts (RN-I06)", () => {
  it("[RN-I06] alerta con el stock bajo el mínimo y también justo en el mínimo", async () => {
    const names = (await alerts()).map((a) => a.product.name).sort();
    expect(names).toEqual(["Agotado de barra", "Bajo el mínimo", "Justo en el mínimo"]);
  });

  it("[LIM] un céntimo sobre el mínimo, un producto sin mínimo o uno inactivo no alertan", async () => {
    const names = (await alerts()).map((a) => a.product.name);
    expect(names).not.toContain("Sobre el mínimo");
    expect(names).not.toContain("Sin mínimo y agotado");
    expect(names).not.toContain("Inactivo y agotado");
  });

  it("el déficit es lo que falta para llegar al mínimo, y el filtro por categoría acota la lista", async () => {
    const deCocina = await alerts(`?categoryId=${cocina.id}`);
    expect(deCocina).toHaveLength(2);
    expect(deCocina.find((a) => a.product.name === "Bajo el mínimo")).toMatchObject({ deficit: 3 });
    expect(deCocina.find((a) => a.product.name === "Justo en el mínimo")).toMatchObject({ deficit: 0 });
  });

  it("[RN-I07] sin sesión responde 401 y sin acceso al inventario 403", async () => {
    session = null;
    expect((await getAlerts(jsonRequest("GET"))).status).toBe(401);
    expect((await getShoppingList()).status).toBe(401);

    session = testUser([]);
    session.user.inventoryAccess = false;
    expect((await getAlerts(jsonRequest("GET"))).status).toBe(403);
    expect((await getShoppingList()).status).toBe(403);
  });
});

describe("GET /api/alerts/shopping-list", () => {
  it("[RN-I06] propone comprar hasta el doble del mínimo", async () => {
    const list: ListRow[] = (await (await getShoppingList()).json()).list;
    expect(list).toHaveLength(3);
    expect(list.find((r) => r.product.name === "Bajo el mínimo")).toMatchObject({ quantityToOrder: 8 });
    expect(list.find((r) => r.product.name === "Agotado de barra")).toMatchObject({ quantityToOrder: 6 });
  });
});
