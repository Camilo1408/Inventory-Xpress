// I-1: las rutas responden 400 (no 500) ante cuerpos inválidos y no tocan la base.

import { describe, it, expect, vi, beforeEach } from "vitest";

type TestSession = {
  user: { id: string; username: string; name: string; role: string; tenantId: string; inventoryAccess: boolean; inventoryPermissions: string[] };
};
let session: TestSession | null;

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: { update: vi.fn(async () => ({ id: "p1" })), findUnique: vi.fn() },
    stockMovement: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { PATCH as patchProduct } from "../products/[id]/route";
import { POST as postMovement } from "../movements/route";

const productUpdate = prisma.product.update as unknown as ReturnType<typeof vi.fn>;
const productFind = prisma.product.findUnique as unknown as ReturnType<typeof vi.fn>;

const as = (perms: string[]) => {
  session = {
    user: { id: "u1", username: "cajero", name: "Cajero", role: "EMPLOYEE", tenantId: "t1", inventoryAccess: true, inventoryPermissions: perms },
  };
};
const params = { params: Promise.resolve({ id: "p1" }) };
const patch = (body: string) =>
  patchProduct(new Request("http://localhost/api/products/p1", { method: "PATCH", body }), params);
const move = (body: string) =>
  postMovement(new Request("http://localhost/api/movements", { method: "POST", body }));

beforeEach(() => {
  vi.clearAllMocks();
  as(["inventory:view", "inventory:products:edit", "inventory:products:delete", "inventory:stock:count"]);
});

describe("PATCH /api/products/[id]", () => {
  it("[NEG] JSON roto ⇒ 400 y no toca la base", async () => {
    expect((await patch("{roto")).status).toBe(400);
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("[NEG] `name: 5` ⇒ 400 (antes `name.trim()` daba 500)", async () => {
    const res = await patch('{"name":5}');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ fields: ["name"] });
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("[NEG] stock mínimo negativo ⇒ 400", async () => {
    expect((await patch('{"minStock":-1}')).status).toBe(400);
  });

  it("solo `active` se sigue gobernando por products:delete, aunque lleguen claves desconocidas", async () => {
    as(["inventory:view", "inventory:products:delete"]);
    expect((await patch('{"active":false,"desconocida":1}')).status).toBe(200);
    expect(productUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { active: false } }));
  });

  it("[NEG] `active` + otro campo exige products:edit ⇒ 403", async () => {
    as(["inventory:view", "inventory:products:delete"]);
    expect((await patch('{"active":false,"name":"Ron"}')).status).toBe(403);
    expect(productUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/movements", () => {
  it("[NEG] cantidad 1e400 (Infinity) ⇒ 400 «Cantidad inválida» antes de buscar el producto", async () => {
    const res = await move('{"productId":"p1","type":"ENTRY","quantity":1e400}');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Cantidad inválida" });
    expect(productFind).not.toHaveBeenCalled();
  });

  it("[NEG] cuerpo `null` ⇒ 400", async () => {
    expect((await move("null")).status).toBe(400);
    expect(productFind).not.toHaveBeenCalled();
  });

  it("los requeridos conservan su mensaje de negocio", async () => {
    const res = await move('{"type":"ENTRY"}');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "productId y type son requeridos" });
  });
});
