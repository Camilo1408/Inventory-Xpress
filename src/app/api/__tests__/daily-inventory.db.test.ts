// Inventario diario contra una SQLite real (ver src/test/db.ts).
//
// RN-I01: todo cambio de stock de la jornada deja su movimiento, en la misma transacción.
// RN-I02: el conteo inicial se concilia contra el stock de INICIO del día
//         (stock actual − movimientos manuales de hoy; los automáticos no se restan).
// RN-I03: un ingreso registrado antes de abrir la jornada no se cuenta dos veces.
// RN-I07: cada acción se autoriza por la clave de la categoría, no por una clave global.

import { jsonRequest, routeParams, testUser } from "@/test/db"; // primero: fija la base de pruebas
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let session: ReturnType<typeof testUser> | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session) }));

import { prisma } from "@/lib/db";
import { businessDayStart, businessToday } from "@/lib/dates";
import { openingStocks } from "@/lib/daily-opening";
import { POST as postMovement } from "../movements/route";
import { GET as getDaily, POST as openDaily } from "../daily-inventory/route";
import { PATCH as patchDaily, DELETE as discardDaily } from "../daily-inventory/[id]/route";

const today = businessToday();
const COUNT = "inventory:stock:count";
const cocinaKeys = (...actions: string[]) => actions.map((a) => `inventory:daily:cocina:${a}`);
const barraKeys = (...actions: string[]) => actions.map((a) => `inventory:daily:barra:${a}`);
const operador = () =>
  testUser([COUNT, ...cocinaKeys("view", "open", "close", "edit"), ...barraKeys("view", "open", "close", "edit")]);

const nextReq = (method: string, body?: unknown, url = "http://localhost/api/daily-inventory") =>
  new NextRequest(jsonRequest(method, body, url));
const move = (body: unknown) => postMovement(jsonRequest("POST", body));
const open = (categoryId: string, items: unknown[], date = today) =>
  openDaily(nextReq("POST", { date, categoryId, items }));
const patch = (id: string, body: unknown) => patchDaily(nextReq("PATCH", body), routeParams(id));
const close = (id: string, finalCounts: unknown[]) => patch(id, { finalCounts });
const discard = (id: string, body?: unknown) => discardDaily(nextReq("DELETE", body), routeParams(id));

type CalcItem = { productId: string; entries: number; exits: number; expected: number; discrepancy: number | null };
async function readDaily(categoryId: string): Promise<{ id: string; status: string; items: CalcItem[] }> {
  const res = await getDaily(nextReq("GET", undefined, `http://localhost/api/daily-inventory?date=${today}&categoryId=${categoryId}`));
  expect(res.status).toBe(200);
  return (await res.json()).inventory;
}
async function openId(categoryId: string, items: unknown[]): Promise<string> {
  const res = await open(categoryId, items);
  expect(res.status).toBe(201);
  return (await res.json()).inventory.id;
}

const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).currentStock;
const autoMovements = (productId: string) =>
  prisma.stockMovement.findMany({ where: { productId, source: { not: null } }, orderBy: { source: "asc" } });

/** El libro cuadra: stock actual = stock de partida + suma de todos sus movimientos. */
async function expectLedger(productId: string, startingStock: number) {
  const sum = await prisma.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } });
  expect(await stockOf(productId)).toBeCloseTo(startingStock + (sum._sum.quantity ?? 0), 9);
}

let cocina: { id: string };
let barra: { id: string };
let a: { id: string }; // postre, stock 10
let b: { id: string }; // postre, stock 5
let ron: { id: string }; // cóctel: botella a la mitad + 2 en reserva = 3

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.dailyInventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();

  cocina = await prisma.category.create({ data: { name: "Cocina", slug: "cocina" } });
  barra = await prisma.category.create({ data: { name: "Barra", slug: "barra" } });
  const postres = await prisma.category.create({ data: { name: "Postres", slug: "postres", parentId: cocina.id } });
  const cocteles = await prisma.category.create({ data: { name: "Cócteles", slug: "cocteles", parentId: barra.id } });
  a = await prisma.product.create({ data: { name: "Tiramisú", unit: "porción", currentStock: 10, categoryId: postres.id } });
  b = await prisma.product.create({ data: { name: "Panna cotta", unit: "porción", currentStock: 5, categoryId: postres.id } });
  ron = await prisma.product.create({
    data: { name: "Ron", unit: "botella", currentStock: 3, bottleLevel: "half", reserveBottles: 2, categoryId: cocteles.id },
  });
  session = operador();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("openingStocks — stock de inicio del día (RN-I02)", () => {
  const manual = (quantity: number, createdAt?: Date, source: string | null = null) =>
    prisma.stockMovement.create({
      data: {
        productId: a.id, type: quantity >= 0 ? "ENTRY" : "EXIT", quantity, source,
        userId: "u-test", userName: "Usuario de Prueba", ...(createdAt ? { createdAt } : {}),
      },
    });

  it("[RN-I02] resta los movimientos manuales de hoy del stock actual", async () => {
    await prisma.product.update({ where: { id: a.id }, data: { currentStock: 13 } });
    await manual(4);
    await manual(-1);
    expect((await openingStocks([a.id], today)).get(a.id)).toBe(10);
  });

  it("[RN-I02] no resta los movimientos automáticos (cierres y ajustes de botella)", async () => {
    await prisma.product.update({ where: { id: a.id }, data: { currentStock: 8 } });
    await manual(-2, undefined, "daily_close_adjust");
    expect((await openingStocks([a.id], today)).get(a.id)).toBe(8);
  });

  it("[LIM] un movimiento de ayer no cuenta; uno en el primer instante de hoy sí", async () => {
    const start = businessDayStart(today);
    await prisma.product.update({ where: { id: a.id }, data: { currentStock: 15 } });
    await manual(2, new Date(start.getTime() - 1)); // último milisegundo de ayer
    await manual(3, start); // primer instante de hoy
    expect((await openingStocks([a.id], today)).get(a.id)).toBe(12);
  });

  it("[LIM] sin productos devuelve un mapa vacío; un producto sin movimientos conserva su stock", async () => {
    expect((await openingStocks([], today)).size).toBe(0);
    expect((await openingStocks([b.id], today)).get(b.id)).toBe(5);
  });
});

describe("Apertura de jornada", () => {
  it("[RN-I02] un conteo igual al stock no genera ajuste", async () => {
    await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await stockOf(a.id)).toBe(10);
  });

  it("[RN-I01] un conteo distinto ajusta el stock con un movimiento `daily_open_adjust`", async () => {
    await openId(cocina.id, [{ productId: b.id, initialCount: 7, note: "Sobraron dos" }]);
    const [ajuste] = await autoMovements(b.id);
    expect(ajuste).toMatchObject({ type: "ADJUSTMENT", quantity: 2, source: "daily_open_adjust", userId: "u-test" });
    expect(ajuste.notes).toContain("Sobraron dos");
    expect(await stockOf(b.id)).toBe(7);
    await expectLedger(b.id, 5);
  });

  it("[RN-I03] un ingreso registrado antes de abrir no se cuenta dos veces ni se borra con un ajuste", async () => {
    await move({ productId: a.id, type: "ENTRY", quantity: 4 }); // llegó mercancía antes de abrir: stock 14
    await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]); // lo que quedó ayer

    // La apertura se concilia contra el stock de inicio del día (10), no contra el actual (14).
    expect(await autoMovements(a.id)).toHaveLength(0);
    expect(await stockOf(a.id)).toBe(14);

    const item = (await readDaily(cocina.id)).items.find((i) => i.productId === a.id)!;
    expect(item).toMatchObject({ entries: 4, exits: 0, expected: 14 });
  });

  it("[NEG] una segunda jornada el mismo día y categoría responde 409", async () => {
    await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    expect((await open(cocina.id, [{ productId: a.id, initialCount: 10 }])).status).toBe(409);
    expect(await prisma.dailyInventory.count()).toBe(1);
  });

  it("[NEG] un producto de otra categoría o un conteo negativo responden 400 y no abren nada", async () => {
    expect((await open(cocina.id, [{ productId: ron.id, initialCount: 1 }])).status).toBe(400);
    expect((await open(cocina.id, [{ productId: a.id, initialCount: -1 }])).status).toBe(400);
    expect(await prisma.dailyInventory.count()).toBe(0);
    expect(await stockOf(a.id)).toBe(10);
  });

  it("[RN-I07] `stock:count` no abre una categoría: hace falta su clave, y el intento queda en auditoría", async () => {
    session = testUser([COUNT, "inventory:view"]);
    expect((await open(cocina.id, [{ productId: a.id, initialCount: 10 }])).status).toBe(403);
    expect(await prisma.dailyInventory.count()).toBe(0);
    const [log] = await prisma.auditLog.findMany();
    expect(log).toMatchObject({ action: "access.denied", result: "denied", categoryId: cocina.id });

    // La clave de otra categoría tampoco sirve.
    session = testUser([COUNT, ...barraKeys("open")]);
    expect((await open(cocina.id, [{ productId: a.id, initialCount: 10 }])).status).toBe(403);
  });

  it("[RN-I07] un rol administrativo abre cualquier categoría sin la clave", async () => {
    session = testUser([], "ADMIN");
    expect((await open(cocina.id, [{ productId: a.id, initialCount: 10 }])).status).toBe(201);
  });
});

describe("Cierre de jornada", () => {
  it("[RN-I01] el stock queda exactamente en el conteo final y el faltante sale como salida no registrada", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    await move({ productId: a.id, type: "ENTRY", quantity: 3 });
    await move({ productId: a.id, type: "EXIT", quantity: 2 }); // esperado 11

    const res = await close(id, [{ productId: a.id, finalCount: 9 }]);
    expect(res.status).toBe(200);
    const item = (await res.json()).inventory.items[0];
    expect(item).toMatchObject({ entries: 3, exits: 2, expected: 11, finalCount: 9, discrepancy: -2, unregisteredExit: 2 });

    expect(await stockOf(a.id)).toBe(9);
    const auto = await autoMovements(a.id);
    expect(auto.map((m) => [m.source, m.quantity])).toEqual([["daily_nr_exit", -2]]);
    await expectLedger(a.id, 10);
    expect((await prisma.dailyInventory.findUniqueOrThrow({ where: { id } })).status).toBe("closed");
  });

  it("[NEG] un sobrante exige motivo y hora: sin ellos responde 400 y la jornada sigue abierta", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    expect((await close(id, [{ productId: a.id, finalCount: 12 }])).status).toBe(400);
    expect(await stockOf(a.id)).toBe(10);
    expect((await prisma.dailyInventory.findUniqueOrThrow({ where: { id } })).status).toBe("open");

    const ok = await close(id, [{ productId: a.id, finalCount: 12, entryReason: "Llegó sin factura", entryTime: "15:30" }]);
    expect(ok.status).toBe(200);
    const [entrada] = await autoMovements(a.id);
    expect(entrada).toMatchObject({ source: "daily_nr_entry", type: "ENTRY", quantity: 2 });
    expect(entrada.notes).toContain("15:30");
    expect(await stockOf(a.id)).toBe(12);
    await expectLedger(a.id, 10);
  });

  it("[RN-I03] con un ingreso previo a la apertura, cerrar con lo esperado no genera ningún movimiento", async () => {
    await move({ productId: a.id, type: "ENTRY", quantity: 4 });
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    const res = await close(id, [{ productId: a.id, finalCount: 14 }]);
    expect((await res.json()).inventory.items[0]).toMatchObject({ expected: 14, discrepancy: 0 });
    expect(await autoMovements(a.id)).toHaveLength(0);
    expect(await stockOf(a.id)).toBe(14);
    await expectLedger(a.id, 10);
  });

  it("[RN-I01] reabrir y volver a cerrar edita los movimientos del cierre en vez de duplicarlos", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    await close(id, [{ productId: a.id, finalCount: 7 }]); // salida no registrada 3
    expect(await stockOf(a.id)).toBe(7);

    expect((await patch(id, { action: "reopen", reason: "Conteo mal hecho" })).status).toBe(200);
    expect((await close(id, [{ productId: a.id, finalCount: 8 }])).status).toBe(200);

    const auto = await autoMovements(a.id);
    expect(auto.filter((m) => m.source === "daily_nr_exit")).toHaveLength(1);
    expect(auto.find((m) => m.source === "daily_nr_exit")!.quantity).toBe(-2);
    expect(await stockOf(a.id)).toBe(8);
    await expectLedger(a.id, 10);
  });

  it("[NEG] cerrar una jornada ya cerrada responde 409 y no mueve el stock", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    await close(id, [{ productId: a.id, finalCount: 9 }]);
    expect((await close(id, [{ productId: a.id, finalCount: 1 }])).status).toBe(409);
    expect(await stockOf(a.id)).toBe(9);
  });

  it("[RN-I07] cerrar exige la clave `:close` de la categoría", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    session = testUser([COUNT, ...cocinaKeys("view", "open")]);
    expect((await close(id, [{ productId: a.id, finalCount: 9 }])).status).toBe(403);
    expect(await stockOf(a.id)).toBe(10);
    expect(await prisma.auditLog.count({ where: { action: "access.denied" } })).toBe(1);
  });

  it("[RN-I01] si el cierre falla a la mitad, no queda ni el conteo ni el movimiento (transacción)", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }, { productId: b.id, initialCount: 5 }]);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER falla_b BEFORE UPDATE ON "Product" WHEN OLD.id = '${b.id}' BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END`
    );
    try {
      await expect(close(id, [{ productId: a.id, finalCount: 6 }, { productId: b.id, finalCount: 1 }])).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER falla_b`);
    }
    // El producto A ya se había procesado dentro de la transacción: debe haberse revertido.
    expect(await stockOf(a.id)).toBe(10);
    expect(await stockOf(b.id)).toBe(5);
    expect(await prisma.stockMovement.count()).toBe(0);
    const jornada = await prisma.dailyInventory.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(jornada.status).toBe("open");
    expect(jornada.items.every((i) => i.finalCount === null)).toBe(true);
  });
});

describe("Cierre de licores por nivel de botella (RN-I04)", () => {
  it("[RN-I04] cerrar con el estado actual no genera movimiento", async () => {
    const id = await openId(barra.id, [{ productId: ron.id, bottleLevel: "half", reserveBottles: 2 }]);
    expect((await close(id, [{ productId: ron.id, bottleLevel: "half", reserveBottles: 2 }])).status).toBe(200);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await stockOf(ron.id)).toBe(3);
  });

  it("[RN-I01] cerrar con otro estado deja un ajuste `daily_close_bottle`, y recerrar lo edita", async () => {
    const id = await openId(barra.id, [{ productId: ron.id, bottleLevel: "half", reserveBottles: 2 }]);
    await close(id, [{ productId: ron.id, bottleLevel: "quarter", reserveBottles: 1 }]);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: ron.id } })).toMatchObject({
      bottleLevel: "quarter", reserveBottles: 1, currentStock: 2,
    });
    expect((await autoMovements(ron.id)).map((m) => [m.source, m.quantity])).toEqual([["daily_close_bottle", -1]]);

    await patch(id, { action: "reopen", reason: "Faltó contar la reserva" });
    await close(id, [{ productId: ron.id, bottleLevel: null, reserveBottles: 0 }]);
    expect((await autoMovements(ron.id)).map((m) => [m.source, m.quantity])).toEqual([["daily_close_bottle", -3]]);
    expect(await stockOf(ron.id)).toBe(0);
    await expectLedger(ron.id, 3);
  });

  it("[NEG] un nivel de botella desconocido o una reserva fraccionaria responden 400", async () => {
    const id = await openId(barra.id, [{ productId: ron.id, bottleLevel: "half", reserveBottles: 2 }]);
    expect((await close(id, [{ productId: ron.id, bottleLevel: "rebosante", reserveBottles: 1 }])).status).toBe(400);
    expect((await close(id, [{ productId: ron.id, bottleLevel: "half", reserveBottles: 1.5 }])).status).toBe(400);
    expect(await stockOf(ron.id)).toBe(3);
  });
});

describe("Reabrir, corregir el conteo inicial y descartar", () => {
  it("[NEG] reabrir exige justificación, la clave `:edit` y que la jornada esté cerrada", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    expect((await patch(id, { action: "reopen", reason: "x" })).status).toBe(409); // sigue abierta
    await close(id, [{ productId: a.id, finalCount: 10 }]);

    expect((await patch(id, { action: "reopen", reason: "   " })).status).toBe(400);
    session = testUser([COUNT, ...cocinaKeys("view", "open", "close")]);
    expect((await patch(id, { action: "reopen", reason: "Motivo" })).status).toBe(403);
    expect((await prisma.dailyInventory.findUniqueOrThrow({ where: { id } })).status).toBe("closed");

    session = operador();
    expect((await patch(id, { action: "reopen", reason: "Motivo" })).status).toBe(200);
    expect(await prisma.dailyInventory.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "open", reopenReason: "Motivo", reopenedBy: "Usuario de Prueba",
    });
  });

  it("[RN-I01] corregir el conteo inicial edita el ajuste de apertura y conserva los movimientos del día", async () => {
    const id = await openId(cocina.id, [{ productId: b.id, initialCount: 7 }]); // ajuste +2, stock 7
    await move({ productId: b.id, type: "EXIT", quantity: 1 }); // stock 6

    const res = await patch(id, { action: "editInitial", initialCounts: [{ productId: b.id, initialCount: 6 }] });
    expect(res.status).toBe(200);

    const auto = await autoMovements(b.id);
    expect(auto.map((m) => [m.source, m.quantity])).toEqual([["daily_open_adjust", 1]]);
    expect(await stockOf(b.id)).toBe(5); // 6 inicial − 1 salida
    await expectLedger(b.id, 5);
  });

  it("[NEG] el conteo inicial solo se corrige con la jornada abierta", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    await close(id, [{ productId: a.id, finalCount: 10 }]);
    const res = await patch(id, { action: "editInitial", initialCounts: [{ productId: a.id, initialCount: 3 }] });
    expect(res.status).toBe(409);
    expect(await stockOf(a.id)).toBe(10);
  });

  it("[RN-I01] descartar una jornada abierta revierte el ajuste de apertura y borra su movimiento", async () => {
    const id = await openId(cocina.id, [{ productId: b.id, initialCount: 7 }]);
    expect(await stockOf(b.id)).toBe(7);

    expect((await discard(id, {})).status).toBe(400); // sin justificación
    expect((await discard(id, { reason: "Se abrió por error" })).status).toBe(200);

    expect(await stockOf(b.id)).toBe(5);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.dailyInventory.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "daily.delete" } })).toBe(1);
  });

  it("[NEG] una jornada cerrada no se descarta", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    await close(id, [{ productId: a.id, finalCount: 8 }]);
    expect((await discard(id, { reason: "Borrar" })).status).toBe(409);
    expect(await prisma.dailyInventory.count()).toBe(1);
    expect(await stockOf(a.id)).toBe(8);
  });
});

describe("Sin sesión", () => {
  it("[RN-I07] todas las acciones responden 401", async () => {
    const id = await openId(cocina.id, [{ productId: a.id, initialCount: 10 }]);
    session = null;
    expect((await open(barra.id, [{ productId: ron.id }])).status).toBe(401);
    expect((await close(id, [{ productId: a.id, finalCount: 1 }])).status).toBe(401);
    expect((await discard(id, { reason: "x" })).status).toBe(401);
    expect(await stockOf(a.id)).toBe(10);
  });
});
