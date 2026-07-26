// prisma/test-movement-edit.ts
// Batería E2E de la corrección de movimientos (PATCH/DELETE /api/movements/[id]):
//   - permisos (EMPLOYEE 403, ADMIN con clave del preset, SUPERADMIN fallback)
//   - editar cantidad/notas de ENTRY/EXIT/ADJUSTMENT numéricos (stock por delta)
//   - guardas: cantidad inválida, stock/reserva negativos, movimiento auto (400)
//   - botellas: editar/eliminar ENTRY mueve solo la reserva
//   - jornada cerrada bloquea (409) y reabrir desbloquea
//   - eliminar revierte el efecto y deja rastro en auditoría
//   Requiere dev server standalone en :3001. Ejecutar: npx tsx prisma/test-movement-edit.ts
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

class Session {
  cookie = "";
  private apply(h: Headers) {
    const sc = (h as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of sc) { const pair = c.split(";")[0]; this.cookie = this.cookie ? `${this.cookie}; ${pair}` : pair; }
  }
  async login(u: string, p: string) {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`); this.apply(csrfRes.headers);
    const { csrfToken } = await csrfRes.json() as { csrfToken: string };
    const body = new URLSearchParams({ csrfToken, username: u, password: p, callbackUrl: `${BASE}/` });
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: this.cookie }, body, redirect: "manual",
    });
    this.apply(res.headers);
  }
  async req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "Content-Type": "application/json", cookie: this.cookie },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* no-json */ }
    return { status: res.status, json: json as Record<string, unknown> };
  }
}

(async () => {
  const sSuper = new Session(); await sSuper.login("superadmin", "superadmin123");
  const sAdmin = new Session(); await sAdmin.login("admin", "admin123");
  const sEmp   = new Session(); await sEmp.login("empleado", "empleado123");
  const today = businessToday();

  const postres = await prisma.category.findFirstOrThrow({ where: { slug: "postres" } });
  const coc     = await prisma.category.findFirstOrThrow({ where: { slug: "cocteles" } });
  const cocina  = await prisma.category.findFirstOrThrow({ where: { slug: "cocina", parentId: null } });

  const pNum = await prisma.product.create({ data: { name: `__MVEDIT_NUM__ ${Date.now()}`, categoryId: postres.id, unit: "unidad", currentStock: 10 } });
  const pBot = await prisma.product.create({ data: { name: `__MVEDIT_BOT__ ${Date.now()}`, categoryId: coc.id, unit: "unidad", bottleLevel: "half", reserveBottles: 2, currentStock: 3 } });

  const busyCocina = await prisma.dailyInventory.findUnique({ where: { date_categoryId: { date: today, categoryId: cocina.id } } });
  let invId = "";
  let pDay: { id: string } | null = null;

  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id }, select: { currentStock: true } })).currentStock;

  try {
    console.log("═══ A. Permisos ═══");
    let r = await sSuper.req("POST", "/api/movements", { productId: pNum.id, type: "ENTRY", quantity: 5 });
    const entryId = (r.json.movement as { id: string }).id; // stock 15

    r = await sEmp.req("PATCH", `/api/movements/${entryId}`, { quantity: 3 });
    ok("EMPLOYEE no puede corregir → 403", r.status === 403, `status=${r.status}`);
    r = await sEmp.req("DELETE", `/api/movements/${entryId}`);
    ok("EMPLOYEE no puede eliminar → 403", r.status === 403, `status=${r.status}`);

    console.log("═══ B. Editar cantidad/notas (numérico) ═══");
    r = await sAdmin.req("PATCH", `/api/movements/${entryId}`, { quantity: 3, notes: "corregido por admin" });
    ok("ADMIN edita ENTRY 5→3 → 200 (clave del preset)", r.status === 200, `status=${r.status} ${JSON.stringify(r.json?.error ?? "")}`);
    ok("stock recalculado 15→13", (await stockOf(pNum.id)) === 13, `stock=${await stockOf(pNum.id)}`);
    const mv = await prisma.stockMovement.findUniqueOrThrow({ where: { id: entryId } });
    ok("movimiento: quantity=3 y notas actualizadas", mv.quantity === 3 && mv.notes === "corregido por admin", JSON.stringify({ q: mv.quantity, n: mv.notes }));

    // EXIT: crear −4 (stock 9) y editar a 8 (stock 5); luego intentar 20 (dejaría −7) → 400.
    r = await sSuper.req("POST", "/api/movements", { productId: pNum.id, type: "EXIT", quantity: 4 });
    const exitId = (r.json.movement as { id: string }).id;
    r = await sSuper.req("PATCH", `/api/movements/${exitId}`, { quantity: 8 });
    ok("editar EXIT 4→8 → 200, stock 9→5", r.status === 200 && (await stockOf(pNum.id)) === 5, `stock=${await stockOf(pNum.id)}`);
    r = await sSuper.req("PATCH", `/api/movements/${exitId}`, { quantity: 20 });
    ok("editar EXIT a 20 dejaría stock negativo → 400", r.status === 400, `status=${r.status}`);

    // ADJUSTMENT con signo: crear −2 (stock 3) y editar a +2 (stock 7).
    r = await sSuper.req("POST", "/api/movements", { productId: pNum.id, type: "ADJUSTMENT", quantity: -2 });
    const adjId = (r.json.movement as { id: string }).id;
    r = await sSuper.req("PATCH", `/api/movements/${adjId}`, { quantity: 2 });
    ok("editar ADJUSTMENT −2→+2 → 200, stock 3→7", r.status === 200 && (await stockOf(pNum.id)) === 7, `stock=${await stockOf(pNum.id)}`);

    console.log("═══ C. Guardas ═══");
    r = await sSuper.req("PATCH", `/api/movements/${adjId}`, { quantity: "abc" });
    ok("quantity=\"abc\" → 400", r.status === 400, `status=${r.status}`);
    r = await sSuper.req("PATCH", `/api/movements/${adjId}`, { quantity: 0 });
    ok("quantity=0 → 400", r.status === 400, `status=${r.status}`);
    r = await sSuper.req("PATCH", `/api/movements/${adjId}`, {});
    ok("sin campos → 400", r.status === 400, `status=${r.status}`);
    r = await sSuper.req("PATCH", `/api/movements/no-existe`, { quantity: 1 });
    ok("id inexistente → 404", r.status === 404, `status=${r.status}`);

    // Movimiento AUTO no corregible: BOTTLE_ADJUST genera source=bottle_adjust.
    r = await sSuper.req("POST", "/api/movements", { productId: pBot.id, type: "BOTTLE_ADJUST", bottleLevel: "half", reserveBottles: 3 });
    const autoAdj = await prisma.stockMovement.findFirstOrThrow({ where: { productId: pBot.id, source: "bottle_adjust" } });
    r = await sSuper.req("PATCH", `/api/movements/${autoAdj.id}`, { quantity: 9 });
    ok("movimiento auto (bottle_adjust) → 400", r.status === 400, `status=${r.status}`);
    r = await sSuper.req("DELETE", `/api/movements/${autoAdj.id}`);
    ok("eliminar movimiento auto → 400", r.status === 400, `status=${r.status}`);

    console.log("═══ D. Botellas: solo la reserva se mueve ═══");
    // Estado tras el BOTTLE_ADJUST: half/3/4. ENTRY +5 → reserva 8, stock 9.
    r = await sSuper.req("POST", "/api/movements", { productId: pBot.id, type: "ENTRY", quantity: 5 });
    const botEntryId = (r.json.movement as { id: string }).id;
    r = await sSuper.req("PATCH", `/api/movements/${botEntryId}`, { quantity: 2 });
    let bot = await prisma.product.findUniqueOrThrow({ where: { id: pBot.id }, select: { bottleLevel: true, reserveBottles: true, currentStock: true } });
    ok("editar ENTRY botella 5→2: reserva 8→5, nivel intacto", r.status === 200 && bot.reserveBottles === 5 && bot.bottleLevel === "half" && bot.currentStock === 6, JSON.stringify(bot));

    // Reserva insuficiente: bajarla a 1 y borrar el ENTRY de 2 → quedaría −1 → 400.
    await prisma.product.update({ where: { id: pBot.id }, data: { reserveBottles: 1, currentStock: 2 } });
    r = await sSuper.req("DELETE", `/api/movements/${botEntryId}`);
    ok("eliminar ENTRY dejaría reserva negativa → 400", r.status === 400, `status=${r.status}`);
    await prisma.product.update({ where: { id: pBot.id }, data: { reserveBottles: 5, currentStock: 6 } });
    r = await sSuper.req("DELETE", `/api/movements/${botEntryId}`);
    bot = await prisma.product.findUniqueOrThrow({ where: { id: pBot.id }, select: { bottleLevel: true, reserveBottles: true, currentStock: true } });
    ok("eliminar ENTRY botella: reserva 5→3, nivel intacto", r.status === 200 && bot.reserveBottles === 3 && bot.bottleLevel === "half", JSON.stringify(bot));

    console.log("═══ E. Jornada cerrada bloquea, reabrir desbloquea ═══");
    if (busyCocina) {
      console.log("  ⚠ Jornada real de Cocina hoy — sección E omitida para no tocarla");
    } else {
      // Producto fresco sin movimientos previos del día: el esperado cuadra al cerrar.
      pDay = await prisma.product.create({ data: { name: `__MVEDIT_DAY__ ${Date.now()}`, categoryId: postres.id, unit: "unidad", currentStock: 7 } });
      r = await sSuper.req("POST", "/api/daily-inventory", {
        date: today, categoryId: cocina.id, items: [{ productId: pDay.id, initialCount: 7 }],
      });
      invId = (r.json.inventory as { id: string }).id;
      r = await sSuper.req("POST", "/api/movements", { productId: pDay.id, type: "ENTRY", quantity: 2 });
      const dayEntryId = (r.json.movement as { id: string }).id; // stock 9, esperado 9
      r = await sSuper.req("PATCH", `/api/daily-inventory/${invId}`, { finalCounts: [{ productId: pDay.id, finalCount: 9 }] });
      ok("jornada cerrada", r.status === 200, `status=${r.status} ${JSON.stringify(r.json?.error ?? "")}`);

      r = await sSuper.req("PATCH", `/api/movements/${dayEntryId}`, { quantity: 1 });
      ok("editar con jornada cerrada → 409", r.status === 409, `status=${r.status}`);
      r = await sSuper.req("DELETE", `/api/movements/${dayEntryId}`);
      ok("eliminar con jornada cerrada → 409", r.status === 409, `status=${r.status}`);

      r = await sSuper.req("PATCH", `/api/daily-inventory/${invId}`, { action: "reopen", reason: "corregir movimiento" });
      ok("jornada reabierta", r.status === 200, `status=${r.status}`);
      r = await sSuper.req("PATCH", `/api/movements/${dayEntryId}`, { quantity: 1 });
      ok("editar tras reabrir → 200, stock 9→8", r.status === 200 && (await stockOf(pDay.id)) === 8, `stock=${await stockOf(pDay.id)}`);
    }

    console.log("═══ F. Auditoría ═══");
    const audits = await prisma.auditLog.findMany({
      where: { action: { in: ["movement.edit", "movement.delete"] }, summary: { contains: "__MVEDIT_" } },
      select: { action: true },
    });
    const edits = audits.filter((a) => a.action === "movement.edit").length;
    const dels  = audits.filter((a) => a.action === "movement.delete").length;
    ok("auditoría registró ediciones y eliminaciones", edits >= 4 && dels >= 1, `edits=${edits} deletes=${dels}`);
  } finally {
    if (invId) await prisma.dailyInventory.delete({ where: { id: invId } }).catch(() => {});
    const ids = [pNum.id, pBot.id, ...(pDay ? [pDay.id] : [])];
    await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { summary: { contains: "__MVEDIT_" } } });
    console.log("\n(limpieza: productos, jornada y auditoría de prueba eliminados)");
  }

  console.log(`\nTOTAL: ${pass}/${pass + fail} OK`);
  process.exit(fail > 0 ? 1 : 0);
})();
