// RN-I01: `currentStock` cambia solo junto con su `StockMovement`, en la misma transacción.
// RN-I08: corregir o eliminar un movimiento manual exige `inventory:movements:edit` y queda en auditoría.
//
// Pruebas de integración contra una SQLite real (ver src/test/db.ts): los handlers de las
// rutas se llaman directo y se comprueba el estado que queda en la base.

import { jsonRequest, routeParams, testUser } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

let session: ReturnType<typeof testUser> | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import { POST as postMovement } from "../movements/route";
import { PATCH as patchMovement, DELETE as deleteMovement } from "../movements/[id]/route";
import { toBusinessDate } from "@/lib/dates";

const COUNT = "inventory:stock:count";
const ADJUST = "inventory:stock:adjust";
const EDIT = "inventory:movements:edit";

const move = (body: unknown) => postMovement(jsonRequest("POST", body));
const correct = (id: string, body: unknown) => patchMovement(jsonRequest("PATCH", body), routeParams(id));
const remove = (id: string) => deleteMovement(jsonRequest("DELETE"), routeParams(id));

/** El libro cuadra: stock actual = stock de partida + suma de todos sus movimientos. */
async function expectLedger(productId: string, startingStock: number) {
  const [product, sum] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    prisma.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } }),
  ]);
  expect(product.currentStock).toBeCloseTo(startingStock + (sum._sum.quantity ?? 0), 9);
  return product;
}

let cocina: { id: string };
let cocteles: { id: string };
let harina: { id: string };

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.dailyInventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();

  cocina = await prisma.category.create({ data: { name: "Cocina", slug: "cocina" } });
  const bar = await prisma.category.create({ data: { name: "Bar", slug: "bar" } });
  cocteles = await prisma.category.create({ data: { name: "Cócteles", slug: "cocteles", parentId: bar.id } });
  harina = await prisma.product.create({
    data: { name: "Harina", unit: "kg", currentStock: 10, categoryId: cocina.id },
  });
  session = testUser([COUNT]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/movements — productos numéricos", () => {
  it("[RN-I01] una entrada suma al stock y deja un movimiento con el usuario de la sesión", async () => {
    const res = await move({ productId: harina.id, type: "ENTRY", quantity: 2.5, notes: "Compra" });
    expect(res.status).toBe(201);

    const movements = await prisma.stockMovement.findMany({ where: { productId: harina.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "ENTRY", quantity: 2.5, notes: "Compra", source: null, userId: "u-test", userName: "Usuario de Prueba",
    });
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(12.5);
  });

  it("[RN-I01] una salida se guarda con signo negativo y resta del stock", async () => {
    expect((await move({ productId: harina.id, type: "EXIT", quantity: 4 })).status).toBe(201);

    const [movement] = await prisma.stockMovement.findMany({ where: { productId: harina.id } });
    expect(movement.quantity).toBe(-4);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(6);
  });

  it("[RN-I01] una entrada con cantidad negativa se normaliza: nunca resta", async () => {
    await move({ productId: harina.id, type: "ENTRY", quantity: -3 });
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(13);
  });

  it("[NEG] una salida mayor que el stock responde 400 y no deja rastro", async () => {
    const res = await move({ productId: harina.id, type: "EXIT", quantity: 10.5 });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Stock insuficiente" });
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(10);
  });

  it("[LIM] una salida por todo el stock lo deja exactamente en 0", async () => {
    expect((await move({ productId: harina.id, type: "EXIT", quantity: 10 })).status).toBe(201);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(0);
  });

  it("[RN-I01] si la actualización del stock falla, el movimiento tampoco queda (transacción)", async () => {
    // Un trigger de SQLite hace fallar el UPDATE de Product dentro de la transacción real.
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER falla_stock BEFORE UPDATE ON "Product" BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END`
    );
    try {
      await expect(move({ productId: harina.id, type: "ENTRY", quantity: 5 })).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER falla_stock`);
    }
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(10);
  });

  it("[RN-I01] tras una secuencia de entradas, salidas y ajustes el historial cuadra con el stock", async () => {
    session = testUser([COUNT, ADJUST]);
    for (const m of [
      { type: "ENTRY", quantity: 7.25 },
      { type: "EXIT", quantity: 3 },
      { type: "ADJUSTMENT", quantity: -1.5 },
      { type: "ENTRY", quantity: 0.5 },
      { type: "ADJUSTMENT", quantity: 2 },
      { type: "EXIT", quantity: 15.25 },
    ]) {
      expect((await move({ productId: harina.id, ...m })).status).toBe(201);
    }
    expect(await prisma.stockMovement.count()).toBe(6);
    expect((await expectLedger(harina.id, 10)).currentStock).toBeCloseTo(0, 9);
  });

  it("[RN-I07] sin sesión responde 401 y sin `stock:count` responde 403", async () => {
    session = null;
    expect((await move({ productId: harina.id, type: "ENTRY", quantity: 1 })).status).toBe(401);
    session = testUser(["inventory:view"]);
    expect((await move({ productId: harina.id, type: "ENTRY", quantity: 1 })).status).toBe(403);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("[RN-I07] un ajuste exige `stock:adjust`, aunque el rol sea ADMIN", async () => {
    session = testUser([COUNT], "ADMIN");
    const res = await move({ productId: harina.id, type: "ADJUSTMENT", quantity: -2 });
    expect(res.status).toBe(403);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(10);

    session = testUser([COUNT, ADJUST]);
    expect((await move({ productId: harina.id, type: "ADJUSTMENT", quantity: -2 })).status).toBe(201);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(8);
  });

  it("[NEG] un ajuste negativo mayor que el stock responde 400 y no deja rastro", async () => {
    session = testUser([COUNT, ADJUST]);
    const res = await move({ productId: harina.id, type: "ADJUSTMENT", quantity: -10.5 });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Stock insuficiente" });
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(10);
  });

  it("[LIM] un ajuste negativo por todo el stock lo deja exactamente en 0", async () => {
    session = testUser([COUNT, ADJUST]);
    expect((await move({ productId: harina.id, type: "ADJUSTMENT", quantity: -10 })).status).toBe(201);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(0);
  });

  it("[NEG] una salida con cantidad negativa también se valida contra el stock", async () => {
    // -15 se normaliza a una salida de 15: antes pasaba la validación (10 - (-15) >= 0).
    const res = await move({ productId: harina.id, type: "EXIT", quantity: -15 });
    expect(res.status).toBe(400);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(10);
  });

  it("[NEG] un producto inactivo o inexistente responde 404", async () => {
    await prisma.product.update({ where: { id: harina.id }, data: { active: false } });
    expect((await move({ productId: harina.id, type: "ENTRY", quantity: 1 })).status).toBe(404);
    expect((await move({ productId: "no-existe", type: "ENTRY", quantity: 1 })).status).toBe(404);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("[NEG] BOTTLE_ADJUST no aplica a un producto numérico", async () => {
    session = testUser([COUNT, ADJUST]);
    const res = await move({ productId: harina.id, type: "BOTTLE_ADJUST", bottleLevel: "half" });
    expect(res.status).toBe(400);
    expect(await prisma.stockMovement.count()).toBe(0);
  });
});

describe("POST /api/movements — licores por nivel de botella (RN-I04)", () => {
  let ron: { id: string };
  const stockDe = async () => prisma.product.findUniqueOrThrow({ where: { id: ron.id } });

  beforeEach(async () => {
    ron = await prisma.product.create({
      data: { name: "Ron", unit: "botella", currentStock: 0, categoryId: cocteles.id },
    });
    session = testUser([COUNT, ADJUST]);
  });

  it("[RN-I04] la primera entrada destapa una botella llena y el resto va a la reserva", async () => {
    expect((await move({ productId: ron.id, type: "ENTRY", quantity: 3 })).status).toBe(201);
    expect(await stockDe()).toMatchObject({ bottleLevel: "full", reserveBottles: 2, currentStock: 3 });
    await expectLedger(ron.id, 0);
  });

  it("[RN-I04] con botella abierta, una entrada solo suma a la reserva", async () => {
    await move({ productId: ron.id, type: "ENTRY", quantity: 1 });
    await move({ productId: ron.id, type: "BOTTLE_ADJUST", bottleLevel: "quarter", reserveBottles: 0 });
    await move({ productId: ron.id, type: "ENTRY", quantity: 2 });
    expect(await stockDe()).toMatchObject({ bottleLevel: "quarter", reserveBottles: 2, currentStock: 3 });
    await expectLedger(ron.id, 0);
  });

  it("[RN-I04] una salida retira de la reserva y nunca toca la botella abierta", async () => {
    await move({ productId: ron.id, type: "ENTRY", quantity: 3 });
    expect((await move({ productId: ron.id, type: "EXIT", quantity: 2 })).status).toBe(201);
    expect(await stockDe()).toMatchObject({ bottleLevel: "full", reserveBottles: 0, currentStock: 1 });

    const res = await move({ productId: ron.id, type: "EXIT", quantity: 1 });
    expect(res.status).toBe(400); // la botella abierta no es reserva
    expect(await stockDe()).toMatchObject({ bottleLevel: "full", reserveBottles: 0, currentStock: 1 });
    await expectLedger(ron.id, 0);
  });

  it("[RN-I04] el ajuste de nivel recalcula el stock y deja un movimiento `bottle_adjust` con la diferencia", async () => {
    await move({ productId: ron.id, type: "ENTRY", quantity: 3 }); // llena + 2 en reserva = 3
    const res = await move({ productId: ron.id, type: "BOTTLE_ADJUST", bottleLevel: null, reserveBottles: 1 });
    expect(res.status).toBe(201);
    expect(await stockDe()).toMatchObject({ bottleLevel: null, reserveBottles: 1, currentStock: 1 });

    const ajuste = await prisma.stockMovement.findFirstOrThrow({ where: { source: "bottle_adjust" } });
    expect(ajuste).toMatchObject({ type: "ADJUSTMENT", quantity: -2 });
    await expectLedger(ron.id, 0);
  });

  it("[RN-I07] el ajuste de nivel exige `stock:adjust`", async () => {
    session = testUser([COUNT]);
    const res = await move({ productId: ron.id, type: "BOTTLE_ADJUST", bottleLevel: "full", reserveBottles: 4 });
    expect(res.status).toBe(403);
    expect(await stockDe()).toMatchObject({ bottleLevel: null, currentStock: 0 });
  });

  it("[NEG] un ajuste numérico no aplica a un licor de cócteles", async () => {
    const res = await move({ productId: ron.id, type: "ADJUSTMENT", quantity: 5 });
    expect(res.status).toBe(400);
    expect(await prisma.stockMovement.count()).toBe(0);
  });
});

describe("PATCH y DELETE /api/movements/[id] (RN-I08)", () => {
  let entrada: { id: string };

  beforeEach(async () => {
    await move({ productId: harina.id, type: "ENTRY", quantity: 6 }); // stock 16
    entrada = await prisma.stockMovement.findFirstOrThrow({ where: { productId: harina.id } });
    session = testUser([COUNT, EDIT]);
  });

  it("[RN-I08] sin `movements:edit` responde 403, también para un ADMIN", async () => {
    session = testUser([COUNT, ADJUST], "EMPLOYEE");
    expect((await correct(entrada.id, { quantity: 1 })).status).toBe(403);
    session = testUser([COUNT, ADJUST], "ADMIN");
    expect((await correct(entrada.id, { quantity: 1 })).status).toBe(403);
    expect((await remove(entrada.id)).status).toBe(403);

    expect((await expectLedger(harina.id, 10)).currentStock).toBe(16);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("[RN-I08] PROPRIETARY y SUPERADMIN corrigen aun sin la clave (fallback por rol)", async () => {
    session = testUser([], "SUPERADMIN");
    expect((await correct(entrada.id, { quantity: 5 })).status).toBe(200);
    session = testUser([], "PROPRIETARY");
    expect((await correct(entrada.id, { quantity: 4 })).status).toBe(200);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(14);
  });

  it("[RN-I08] corregir la cantidad mueve el stock por la diferencia y queda en auditoría", async () => {
    const res = await correct(entrada.id, { quantity: 2, notes: "  Era menos  " });
    expect(res.status).toBe(200);

    const movement = await prisma.stockMovement.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(movement).toMatchObject({ quantity: 2, notes: "Era menos" });
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(12);

    const log = await prisma.auditLog.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: "movement.edit", entityType: "StockMovement", entityId: entrada.id, userId: "u-test", result: "success",
    });
    expect(log[0].summary).toContain("6 → 2");
  });

  it("[RN-I08] corregir una salida conserva el signo negativo", async () => {
    session = testUser([COUNT, EDIT]);
    await move({ productId: harina.id, type: "EXIT", quantity: 3 }); // stock 13
    const salida = await prisma.stockMovement.findFirstOrThrow({ where: { type: "EXIT" } });

    expect((await correct(salida.id, { quantity: 5 })).status).toBe(200);
    expect((await prisma.stockMovement.findUniqueOrThrow({ where: { id: salida.id } })).quantity).toBe(-5);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(11);
  });

  it("[RN-I08] corregir solo las notas no toca el stock", async () => {
    expect((await correct(entrada.id, { notes: "Factura 123" })).status).toBe(200);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(16);
  });

  it("[NEG] una corrección que dejaría el stock negativo responde 400 y no cambia nada", async () => {
    await move({ productId: harina.id, type: "EXIT", quantity: 15 }); // stock 1
    const res = await correct(entrada.id, { quantity: 4 }); // 1 − 2 = −1
    expect(res.status).toBe(400);
    expect((await prisma.stockMovement.findUniqueOrThrow({ where: { id: entrada.id } })).quantity).toBe(6);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("[NEG] cantidad 0, cuerpo vacío o movimiento inexistente no corrigen nada", async () => {
    expect((await correct(entrada.id, { quantity: 0 })).status).toBe(400);
    expect((await correct(entrada.id, {})).status).toBe(400);
    expect((await correct("no-existe", { quantity: 1 })).status).toBe(404);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(16);
  });

  it("[RN-I08] un movimiento generado por el sistema no se corrige ni se elimina desde aquí", async () => {
    const auto = await prisma.stockMovement.create({
      data: {
        productId: harina.id, type: "ADJUSTMENT", quantity: 1, source: "daily_close_adjust",
        userId: "u-test", userName: "Usuario de Prueba",
      },
    });
    expect((await correct(auto.id, { quantity: 9 })).status).toBe(400);
    expect((await remove(auto.id)).status).toBe(400);
    expect((await prisma.stockMovement.findUniqueOrThrow({ where: { id: auto.id } })).quantity).toBe(1);
  });

  it("[RN-I08] con la jornada de ese día cerrada responde 409 hasta que se reabra", async () => {
    const jornada = await prisma.dailyInventory.create({
      data: {
        date: toBusinessDate(new Date()), categoryId: cocina.id, status: "closed",
        userId: "u-test", userName: "Usuario de Prueba",
      },
    });
    expect((await correct(entrada.id, { quantity: 1 })).status).toBe(409);
    expect((await remove(entrada.id)).status).toBe(409);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(16);

    await prisma.dailyInventory.update({ where: { id: jornada.id }, data: { status: "open" } });
    expect((await correct(entrada.id, { quantity: 1 })).status).toBe(200);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(11);
  });

  it("[RN-I08] eliminar revierte el efecto en el stock, borra el registro y queda en auditoría", async () => {
    expect((await remove(entrada.id)).status).toBe(200);

    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(10);
    const log = await prisma.auditLog.findMany();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "movement.delete", entityId: entrada.id });
  });

  it("[NEG] eliminar una entrada ya consumida responde 400 y la conserva", async () => {
    await move({ productId: harina.id, type: "EXIT", quantity: 12 }); // stock 4
    expect((await remove(entrada.id)).status).toBe(400); // 4 − 6 = −2
    expect(await prisma.stockMovement.count()).toBe(2);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(4);
  });

  it("[RN-I01] si falla la actualización del stock, la corrección del movimiento tampoco queda", async () => {
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER falla_stock BEFORE UPDATE ON "Product" BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END`
    );
    try {
      await expect(correct(entrada.id, { quantity: 1 })).rejects.toThrow();
      await expect(remove(entrada.id)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER falla_stock`);
    }
    expect((await prisma.stockMovement.findUniqueOrThrow({ where: { id: entrada.id } })).quantity).toBe(6);
    expect((await expectLedger(harina.id, 10)).currentStock).toBe(16);
  });
});
