// prisma/test-daily-inventory.ts
// Batería integral del fix de inventario diario:
//   1. Numéricos: esperado = inicial + entradas − salidas ± AJUSTES del día.
//   2. Cierre guarda el conteo real tecleado (no el inicial) y stock = final.
//   3. Botellas: cerrar con el estado vivo (lo que ahora pre-llena la UI) NO
//      pierde las entradas del día ni genera movimiento fantasma.
//   4. Botellas: cerrar con un conteo DISTINTO deja ADJUSTMENT trazable
//      (source daily_close_bottle) y al recerrar lo EDITA (sin duplicar).
//   5. Invariante global: stock final = stock inicial + Σ movimientos.
//   Ejecutar: npx tsx prisma/test-daily-inventory.ts
import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { businessToday } from "../src/lib/dates";

const BASE = "http://localhost:3001";
const adapter = new PrismaLibSql({ url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db", authToken: process.env.TURSO_AUTH_TOKEN });
const prisma = new PrismaClient({ adapter });

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (cond) pass++; else fail++;
}

let cookie = "";
function applyCookie(h: Headers) {
  const sc = (h as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of sc) { const pair = c.split(";")[0]; cookie = cookie ? `${cookie}; ${pair}` : pair; }
}
async function login(u: string, p: string) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`); applyCookie(csrfRes.headers);
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, username: u, password: p, callbackUrl: `${BASE}/` });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", cookie }, body, redirect: "manual",
  });
  applyCookie(res.headers);
}
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { "Content-Type": "application/json", cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* no-json */ }
  return { status: res.status, json: json as Record<string, unknown> };
}
async function movementSum(productId: string) {
  const movs = await prisma.stockMovement.findMany({ where: { productId }, select: { quantity: true } });
  return movs.reduce((s, m) => s + m.quantity, 0);
}

interface GotItem { productId: string; finalCount: number | null; entries: number; exits: number; expected: number; discrepancy: number | null }

(async () => {
  await login("superadmin", "superadmin123");
  const today = businessToday();

  const cocina = await prisma.category.findFirstOrThrow({ where: { slug: "cocina", parentId: null } });
  const barra  = await prisma.category.findFirstOrThrow({ where: { slug: "barra",  parentId: null } });
  const postres = await prisma.category.findFirstOrThrow({ where: { slug: "postres" } });
  const coc     = await prisma.category.findFirstOrThrow({ where: { slug: "cocteles" } });

  const pA = await prisma.product.create({ data: { name: `__FULL_A__ ${Date.now()}`, categoryId: postres.id, unit: "unidad", currentStock: 10 } });
  const pB = await prisma.product.create({ data: { name: `__FULL_B__ ${Date.now()}`, categoryId: postres.id, unit: "unidad", currentStock: 5 } });
  const pBot = await prisma.product.create({ data: { name: `__FULL_BOT__ ${Date.now()}`, categoryId: coc.id, unit: "unidad", bottleLevel: "half", reserveBottles: 2, currentStock: 3 } });

  const busyCocina = await prisma.dailyInventory.findUnique({ where: { date_categoryId: { date: today, categoryId: cocina.id } } });
  const busyBarra  = await prisma.dailyInventory.findUnique({ where: { date_categoryId: { date: today, categoryId: barra.id } } });
  const dateCocina = busyCocina ? "2020-02-01" : today;
  const dateBarra  = busyBarra  ? "2020-02-01" : today;
  let invCocina = "", invBarra = "";

  try {
    console.log("═══ A. Numéricos: apertura con valores nuevos + movimientos del día ═══");

    // Abrir con A=10 (== stock) y B=7 (≠ stock 5 → ajuste de apertura +2).
    let r = await api("POST", "/api/daily-inventory", {
      date: dateCocina, categoryId: cocina.id,
      items: [{ productId: pA.id, initialCount: 10 }, { productId: pB.id, initialCount: 7 }],
    });
    ok("abrir Cocina (A=10, B=7) → 201", r.status === 201, `status=${r.status} ${JSON.stringify(r.json?.error ?? "")}`);
    invCocina = (r.json.inventory as { id: string }).id;
    ok("stock B reconciliado a 7 al abrir", (await prisma.product.findUniqueOrThrow({ where: { id: pB.id } })).currentStock === 7);

    // Movimientos del día: A: ENTRY+3, EXIT−2, ADJUSTMENT−1  |  B: ADJUSTMENT+4.
    for (const [pid, type, qty] of [[pA.id, "ENTRY", 3], [pA.id, "EXIT", 2], [pA.id, "ADJUSTMENT", -1], [pB.id, "ADJUSTMENT", 4]] as const) {
      r = await api("POST", "/api/movements", { productId: pid, type, quantity: qty });
      ok(`${type} ${qty > 0 ? "+" : ""}${qty} → 201`, r.status === 201, `status=${r.status} ${JSON.stringify(r.json?.error ?? "")}`);
    }

    // GET: esperado debe INCLUIR los ajustes → A: 10+3−(2+1)=10 | B: 7+4=11.
    r = await api("GET", `/api/daily-inventory?date=${dateCocina}&categoryId=${cocina.id}`);
    const items = (r.json.inventory as { items: GotItem[] }).items;
    const gA = items.find((i) => i.productId === pA.id)!;
    const gB = items.find((i) => i.productId === pB.id)!;
    ok("GET esperado A=10 (entradas 3, salidas 2+|−1|=3)", gA.expected === 10 && gA.entries === 3 && gA.exits === 3, JSON.stringify({ e: gA.entries, x: gA.exits, exp: gA.expected }));
    ok("GET esperado B=11 (ajuste +4 cuenta como entrada)", gB.expected === 11 && gB.entries === 4 && gB.exits === 0, JSON.stringify({ e: gB.entries, x: gB.exits, exp: gB.expected }));

    console.log("═══ B. Cierre numérico: se guarda el conteo REAL tecleado ═══");

    // Cerrar: A contó 8 (faltante 2 → NR salida auto), B contó 12 (sobrante 1 → NR entrada declarada).
    r = await api("PATCH", `/api/daily-inventory/${invCocina}`, {
      finalCounts: [
        { productId: pA.id, finalCount: 8 },
        { productId: pB.id, finalCount: 12, unregisteredEntry: 1, entryReason: "reposición tardía", entryTime: "19:00" },
      ],
    });
    ok("cerrar Cocina → 200", r.status === 200, `status=${r.status} ${JSON.stringify(r.json?.error ?? "").slice(0, 150)}`);

    const dbItems = await prisma.dailyInventoryItem.findMany({ where: { dailyInventoryId: invCocina }, select: { productId: true, initialCount: true, finalCount: true, unregisteredEntry: true, unregisteredExit: true } });
    const iA = dbItems.find((i) => i.productId === pA.id)!;
    const iB = dbItems.find((i) => i.productId === pB.id)!;
    ok("A: finalCount=8 guardado (no el inicial 10)", iA.finalCount === 8, JSON.stringify(iA));
    ok("A: NR salida auto = 2 (esperado 10 − contado 8)", iA.unregisteredExit === 2, `exit=${iA.unregisteredExit}`);
    ok("B: finalCount=12 guardado (no el inicial 7)", iB.finalCount === 12, JSON.stringify(iB));
    ok("B: NR entrada = 1", iB.unregisteredEntry === 1, `entry=${iB.unregisteredEntry}`);

    const sA = (await prisma.product.findUniqueOrThrow({ where: { id: pA.id } })).currentStock;
    const sB = (await prisma.product.findUniqueOrThrow({ where: { id: pB.id } })).currentStock;
    ok("stock A=8 y B=12 tras cierre (= conteo real)", sA === 8 && sB === 12, `A=${sA} B=${sB}`);

    // Invariante de trazabilidad: stock = stock de creación + Σ movimientos.
    ok("trazabilidad A: 10 + Σmov = stock", 10 + (await movementSum(pA.id)) === sA, `Σ=${await movementSum(pA.id)}`);
    ok("trazabilidad B: 5 + Σmov = stock", 5 + (await movementSum(pB.id)) === sB, `Σ=${await movementSum(pB.id)}`);

    console.log("═══ C. Botellas: entrada del día + cierre con estado vivo (UI corregida) ═══");

    // Abrir Barra con la botella (snapshot half/2) y registrar ENTRY +5 (vivo: half/7/8).
    r = await api("POST", "/api/daily-inventory", {
      date: dateBarra, categoryId: barra.id,
      items: [{ productId: pBot.id, initialCount: 0, bottleLevel: "half", reserveBottles: 2 }],
    });
    ok("abrir Barra → 201", r.status === 201, `status=${r.status} ${JSON.stringify(r.json?.error ?? "")}`);
    invBarra = (r.json.inventory as { id: string }).id;
    r = await api("POST", "/api/movements", { productId: pBot.id, type: "ENTRY", quantity: 5 });
    ok("ENTRY +5 botellas → 201", r.status === 201);

    // La UI corregida pre-llena con el estado VIVO (half/7) — cerrar "sin tocar".
    r = await api("PATCH", `/api/daily-inventory/${invBarra}`, {
      finalCounts: [{ productId: pBot.id, finalCount: 0, bottleLevel: "half", reserveBottles: 7 }],
    });
    ok("cerrar Barra con estado vivo → 200", r.status === 200, `status=${r.status}`);
    let dbBot = await prisma.product.findUniqueOrThrow({ where: { id: pBot.id }, select: { bottleLevel: true, reserveBottles: true, currentStock: true } });
    ok("SIN pérdida: producto sigue half/7/8", dbBot.bottleLevel === "half" && dbBot.reserveBottles === 7 && dbBot.currentStock === 8, JSON.stringify(dbBot));
    let autoBot = await prisma.stockMovement.findMany({ where: { productId: pBot.id, source: "daily_close_bottle" }, select: { quantity: true } });
    ok("sin movimiento fantasma (delta 0 → no crea ADJUSTMENT)", autoBot.length === 0, `count=${autoBot.length}`);

    console.log("═══ D. Botellas: conteo real DISTINTO → ADJUSTMENT trazable, recerrar edita ═══");

    // Reabrir y cerrar con lo realmente contado: quarter/6 → stock 7 (delta −1).
    r = await api("PATCH", `/api/daily-inventory/${invBarra}`, { action: "reopen", reason: "conteo físico difiere" });
    ok("reabrir Barra → 200", r.status === 200);
    r = await api("PATCH", `/api/daily-inventory/${invBarra}`, {
      finalCounts: [{ productId: pBot.id, finalCount: 0, bottleLevel: "quarter", reserveBottles: 6 }],
    });
    ok("cerrar con quarter/6 → 200", r.status === 200, `status=${r.status}`);
    dbBot = await prisma.product.findUniqueOrThrow({ where: { id: pBot.id }, select: { bottleLevel: true, reserveBottles: true, currentStock: true } });
    ok("producto = quarter/6/7", dbBot.bottleLevel === "quarter" && dbBot.reserveBottles === 6 && dbBot.currentStock === 7, JSON.stringify(dbBot));
    autoBot = await prisma.stockMovement.findMany({ where: { productId: pBot.id, source: "daily_close_bottle" }, select: { quantity: true } });
    ok("ADJUSTMENT daily_close_bottle = −1 creado", autoBot.length === 1 && autoBot[0].quantity === -1, JSON.stringify(autoBot));

    // Recerrar con quarter/5 (stock 6): debe EDITAR el mismo movimiento a −2, no duplicar.
    r = await api("PATCH", `/api/daily-inventory/${invBarra}`, { action: "reopen", reason: "segunda corrección" });
    r = await api("PATCH", `/api/daily-inventory/${invBarra}`, {
      finalCounts: [{ productId: pBot.id, finalCount: 0, bottleLevel: "quarter", reserveBottles: 5 }],
    });
    ok("recerrar con quarter/5 → 200", r.status === 200, `status=${r.status}`);
    dbBot = await prisma.product.findUniqueOrThrow({ where: { id: pBot.id }, select: { bottleLevel: true, reserveBottles: true, currentStock: true } });
    autoBot = await prisma.stockMovement.findMany({ where: { productId: pBot.id, source: "daily_close_bottle" }, select: { quantity: true } });
    ok("producto = quarter/5/6 y UN solo ADJUSTMENT editado a −2", dbBot.currentStock === 6 && autoBot.length === 1 && autoBot[0].quantity === -2, `stock=${dbBot.currentStock} autos=${JSON.stringify(autoBot)}`);

    // Invariante final de trazabilidad de la botella: 3 (creación) + Σmov = stock.
    const sumBot = await movementSum(pBot.id);
    ok("trazabilidad botella: 3 + Σmov = stock", 3 + sumBot === dbBot.currentStock, `3 + ${sumBot} = ${3 + sumBot} vs ${dbBot.currentStock}`);
  } finally {
    if (invCocina) await prisma.dailyInventory.delete({ where: { id: invCocina } }).catch(() => {});
    if (invBarra)  await prisma.dailyInventory.delete({ where: { id: invBarra } }).catch(() => {});
    await prisma.stockMovement.deleteMany({ where: { productId: { in: [pA.id, pB.id, pBot.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [pA.id, pB.id, pBot.id] } } });
    console.log("\n(limpieza: jornadas y productos de prueba eliminados)");
  }

  console.log(`\nTOTAL: ${pass}/${pass + fail} OK`);
  process.exit(fail > 0 ? 1 : 0);
})();
