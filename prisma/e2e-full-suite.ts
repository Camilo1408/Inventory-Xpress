// prisma/e2e-full-suite.ts
// Batería E2E completa contra el servidor de dev (http://localhost:3001).
// Cubre: login, permisos por rol, movimientos, inventario diario (abrir/cerrar/
// reabrir), reportes, auditoría, gestión de roles/usuarios, overrides sin
// re-login, y perfil de usuario. Limpia todos los datos que crea al finalizar.
//
// Ejecutar con: npx tsx prisma/e2e-full-suite.ts   (requiere AUTH_MODE=standalone)

import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const BASE = "http://localhost:3001";
const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

// ─── Infraestructura de pruebas ───────────────────────────────────────────────

interface Result { section: string; name: string; pass: boolean; detail?: string }
const results: Result[] = [];

function record(section: string, name: string, pass: boolean, detail?: string) {
  results.push({ section, name, pass, detail });
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function expect(section: string, name: string, fn: () => Promise<boolean | string>) {
  try {
    const r = await fn();
    if (r === true) record(section, name, true);
    else if (r === false) record(section, name, false, "condición falsa");
    else record(section, name, false, r); // string = mensaje de fallo
  } catch (e) {
    record(section, name, false, `excepción: ${(e as Error).message}`);
  }
}

// ─── Cliente HTTP con cookie jar simple por sesión ────────────────────────────

class Session {
  cookies = new Map<string, string>();

  private applySetCookie(headers: Headers) {
    const raw = headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async login(username: string, password: string): Promise<boolean> {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    this.applySetCookie(csrfRes.headers);
    const { csrfToken } = await csrfRes.json() as { csrfToken: string };

    const body = new URLSearchParams({
      csrfToken, username, password, callbackUrl: `${BASE}/`,
    });
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: this.cookieHeader() },
      body,
      redirect: "manual",
    });
    this.applySetCookie(res.headers);
    return this.cookies.has("authjs.session-token");
  }

  async req(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Cookie: this.cookieHeader(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    this.applySetCookie(res.headers);
    let json: unknown = null;
    try { json = await res.clone().json(); } catch { /* respuesta no-JSON (páginas, redirects) */ }
    return { status: res.status, json };
  }

  /** Para páginas server-rendered: status + HTML crudo (sin seguir redirects). */
  async page(path: string): Promise<{ status: number; html: string }> {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: this.cookieHeader() }, redirect: "manual" });
    const html = await res.text();
    return { status: res.status, html };
  }
}

async function loginAs(username: string, password: string): Promise<Session> {
  const s = new Session();
  const ok = await s.login(username, password);
  if (!ok) throw new Error(`Login falló para ${username}`);
  return s;
}

// ─── Limpieza de artefactos de prueba (antes y después) ──────────────────────

const E2E_TAG = "E2E_TEST_";

async function cleanupTestArtifacts() {
  // Movimientos de productos de prueba
  const testProducts = await prisma.product.findMany({ where: { name: { startsWith: E2E_TAG } }, select: { id: true } });
  const testProductIds = testProducts.map((p) => p.id);
  if (testProductIds.length > 0) {
    await prisma.stockMovement.deleteMany({ where: { productId: { in: testProductIds } } });
    await prisma.dailyInventoryItem.deleteMany({ where: { productId: { in: testProductIds } } });
  }
  await prisma.dailyInventory.deleteMany({ where: { category: { name: { startsWith: E2E_TAG } } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: E2E_TAG } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: E2E_TAG } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: "e2e_" } } });
  await prisma.role.deleteMany({ where: { name: { startsWith: E2E_TAG } } });
}

// ─── Suite principal ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Limpieza previa de artefactos de prueba ═══");
  await cleanupTestArtifacts();

  console.log("\n═══ SECCIÓN A — Autenticación ═══");
  let sSuper!: Session, sAdmin!: Session, sEmp!: Session;

  await expect("A", "Login SUPERADMIN con credenciales correctas", async () => {
    sSuper = await loginAs("superadmin", "superadmin123");
    return true;
  });
  await expect("A", "Login ADMIN con credenciales correctas", async () => {
    sAdmin = await loginAs("admin", "admin123");
    return true;
  });
  await expect("A", "Login EMPLOYEE con credenciales correctas", async () => {
    sEmp = await loginAs("empleado", "empleado123");
    return true;
  });
  await expect("A", "Login con contraseña incorrecta falla", async () => {
    const s = new Session();
    const ok = await s.login("empleado", "clave-incorrecta-xyz");
    return ok === false || "el login debió fallar";
  });
  await expect("A", "Acceso a página protegida sin sesión redirige a /login", async () => {
    const anon = new Session();
    const r = await anon.page("/");
    return (r.status >= 300 && r.status < 400) || `status inesperado ${r.status}`;
  });
  await expect("A", "API sin sesión devuelve 401", async () => {
    const anon = new Session();
    const r = await anon.req("GET", "/api/products");
    return r.status === 401 || `status ${r.status}`;
  });

  console.log("\n═══ SECCIÓN B — Permisos: productos y categorías ═══");

  let testProductId = "";
  await expect("B", "SUPERADMIN puede crear producto", async () => {
    // Necesitamos una categoría existente; usamos "Barra" del seed.
    const barra = await prisma.category.findFirst({ where: { name: "Barra", parentId: null } });
    if (!barra) return "no existe categoría Barra (seed no ejecutado)";
    const r = await sSuper.req("POST", "/api/products", {
      name: `${E2E_TAG}PRODUCTO_1`, categoryId: barra.id, unit: "unidad", minStock: 2,
    });
    if (r.status !== 201) return `status ${r.status}: ${JSON.stringify(r.json)}`;
    testProductId = (r.json as { product: { id: string } }).product.id;
    return true;
  });
  await expect("B", "ADMIN NO puede crear producto (403)", async () => {
    const barra = await prisma.category.findFirst({ where: { name: "Barra", parentId: null } });
    const r = await sAdmin.req("POST", "/api/products", { name: `${E2E_TAG}NO_DEBERIA_EXISTIR`, categoryId: barra!.id, unit: "unidad" });
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("B", "EMPLOYEE NO puede crear producto (403)", async () => {
    const barra = await prisma.category.findFirst({ where: { name: "Barra", parentId: null } });
    const r = await sEmp.req("POST", "/api/products", { name: `${E2E_TAG}NO_DEBERIA_EXISTIR2`, categoryId: barra!.id, unit: "unidad" });
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("B", "Todos los roles pueden LEER productos (200)", async () => {
    const [a, b, c] = await Promise.all([sSuper.req("GET", "/api/products"), sAdmin.req("GET", "/api/products"), sEmp.req("GET", "/api/products")]);
    return (a.status === 200 && b.status === 200 && c.status === 200) || `status ${a.status}/${b.status}/${c.status}`;
  });
  await expect("B", "ADMIN NO puede editar producto — campo completo (403)", async () => {
    const r = await sAdmin.req("PATCH", `/api/products/${testProductId}`, { name: `${E2E_TAG}RENOMBRADO` });
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("B", "SUPERADMIN puede editar producto (200)", async () => {
    const r = await sSuper.req("PATCH", `/api/products/${testProductId}`, { minStock: 5 });
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("B", "[FIX] ADMIN puede desactivar producto (200) — PRODUCTS_DELETE", async () => {
    const r = await sAdmin.req("DELETE", `/api/products/${testProductId}`);
    return r.status === 200 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("B", "[FIX] ADMIN puede REACTIVAR el producto que desactivó (200) — antes exigía PRODUCTS_EDIT", async () => {
    const r = await sAdmin.req("PATCH", `/api/products/${testProductId}`, { active: true });
    return r.status === 200 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("B", "EMPLOYEE NO puede desactivar producto (403)", async () => {
    const r = await sEmp.req("DELETE", `/api/products/${testProductId}`);
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("B", "ADMIN NO puede borrado permanente (403)", async () => {
    const r = await sAdmin.req("DELETE", `/api/products/${testProductId}?mode=hard`);
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("B", "Borrado permanente con historial es rechazado (409 HAS_HISTORY)", async () => {
    // El producto ya tiene un movimiento de ajuste (minStock no cuenta, forcemos un movement)
    await sSuper.req("POST", "/api/movements", { productId: testProductId, type: "ENTRY", quantity: 1 });
    const r = await sSuper.req("DELETE", `/api/products/${testProductId}?mode=hard`);
    const j = r.json as { code?: string };
    return (r.status === 409 && j.code === "HAS_HISTORY") || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("B", "SUPERADMIN puede crear categoría (201)", async () => {
    const r = await sSuper.req("POST", "/api/categories", { name: `${E2E_TAG}CATEGORIA` });
    return r.status === 201 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("B", "ADMIN NO puede crear categoría (403)", async () => {
    const r = await sAdmin.req("POST", "/api/categories", { name: `${E2E_TAG}CATEGORIA_ADMIN` });
    return r.status === 403 || `status ${r.status}`;
  });

  console.log("\n═══ SECCIÓN C — Movimientos ═══");
  await expect("C", "Los 3 roles pueden registrar ENTRY (STOCK_COUNT baseline)", async () => {
    const [a, b, c] = await Promise.all([
      sSuper.req("POST", "/api/movements", { productId: testProductId, type: "ENTRY", quantity: 1 }),
      sAdmin.req("POST", "/api/movements", { productId: testProductId, type: "ENTRY", quantity: 1 }),
      sEmp.req("POST", "/api/movements", { productId: testProductId, type: "ENTRY", quantity: 1 }),
    ]);
    return (a.status === 201 && b.status === 201 && c.status === 201) || `status ${a.status}/${b.status}/${c.status}`;
  });
  await expect("C", "SUPERADMIN puede hacer ADJUSTMENT (STOCK_ADJUST)", async () => {
    const r = await sSuper.req("POST", "/api/movements", { productId: testProductId, type: "ADJUSTMENT", quantity: 1 });
    return r.status === 201 || `status ${r.status}`;
  });
  await expect("C", "EMPLOYEE NO puede hacer ADJUSTMENT (403) — STOCK_ADJUST", async () => {
    const r = await sEmp.req("POST", "/api/movements", { productId: testProductId, type: "ADJUSTMENT", quantity: 1 });
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("C", "EXIT con cantidad mayor al stock es rechazado (400)", async () => {
    const p = await prisma.product.findUnique({ where: { id: testProductId } });
    const r = await sSuper.req("POST", "/api/movements", { productId: testProductId, type: "EXIT", quantity: (p?.currentStock ?? 0) + 1000 });
    return r.status === 400 || `status ${r.status}`;
  });

  console.log("\n═══ SECCIÓN D — Inventario diario (abrir/cerrar/reabrir) ═══");

  let testCategoryId = "";
  let testDailyProductId = "";
  // Debe ser HOY: el cierre correlaciona movimientos registrados por fecha calendario
  // (createdAt=now() al registrarlos), así que una fecha ficticia futura nunca emparejaría.
  // No hay riesgo de colisión: la categoría de prueba es dedicada y se limpia en cada corrida.
  const testDate = new Date().toISOString().slice(0, 10);

  await expect("D", "Setup: crear categoría y producto de prueba para inventario diario", async () => {
    const cat = await prisma.category.create({ data: { name: `${E2E_TAG}DIARIO`, slug: "e2e-test-diario", sortOrder: 999 } });
    testCategoryId = cat.id;
    const prod = await prisma.product.create({ data: { name: `${E2E_TAG}PRODUCTO_DIARIO`, categoryId: cat.id, unit: "unidad", currentStock: 0 } });
    testDailyProductId = prod.id;
    return true;
  });

  let dailyInventoryId = "";
  await expect("D", "EMPLOYEE puede ABRIR inventario diario (STOCK_COUNT)", async () => {
    const r = await sEmp.req("POST", "/api/daily-inventory", {
      date: testDate, categoryId: testCategoryId,
      items: [{ productId: testDailyProductId, initialCount: 5 }],
    });
    if (r.status !== 201) return `status ${r.status}: ${JSON.stringify(r.json)}`;
    dailyInventoryId = (r.json as { inventory: { id: string } }).inventory.id;
    return true;
  });
  await expect("D", "Apertura reconcilia currentStock al conteo inicial (regla no-negociable #2)", async () => {
    const p = await prisma.product.findUnique({ where: { id: testDailyProductId } });
    return p?.currentStock === 5 || `currentStock=${p?.currentStock}, esperado 5`;
  });
  await expect("D", "EMPLOYEE puede VER el inventario diario abierto (200)", async () => {
    const r = await sEmp.req("GET", `/api/daily-inventory?date=${testDate}&categoryId=${testCategoryId}`);
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("D", "Registrar una ENTRY real de 3 unidades durante el día (para que el cierre cuadre sin NR)", async () => {
    const r = await sEmp.req("POST", "/api/movements", { productId: testDailyProductId, type: "ENTRY", quantity: 3 });
    return r.status === 201 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("D", "EMPLOYEE puede CERRAR el inventario diario (STOCK_COUNT) — finalCount=8 (5 inicial + 3 entrada)", async () => {
    const r = await sEmp.req("PATCH", `/api/daily-inventory/${dailyInventoryId}`, {
      finalCounts: [{ productId: testDailyProductId, finalCount: 8 }],
    });
    return r.status === 200 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("D", "Cierre deja currentStock exactamente en el conteo final", async () => {
    const p = await prisma.product.findUnique({ where: { id: testDailyProductId } });
    return p?.currentStock === 8 || `currentStock=${p?.currentStock}, esperado 8`;
  });
  await expect("D", "[FIX CRÍTICO] EMPLOYEE NO puede REABRIR inventario cerrado (403) — antes STOCK_COUNT bastaba", async () => {
    const r = await sEmp.req("PATCH", `/api/daily-inventory/${dailyInventoryId}`, { action: "reopen", reason: "prueba e2e" });
    return r.status === 403 || `status ${r.status} — VULNERABILIDAD: EMPLOYEE reabrió sin permiso DAILY_REOPEN`;
  });
  await expect("D", "ADMIN SÍ puede REABRIR inventario cerrado (200) — tiene DAILY_REOPEN", async () => {
    const r = await sAdmin.req("PATCH", `/api/daily-inventory/${dailyInventoryId}`, { action: "reopen", reason: "prueba e2e" });
    return r.status === 200 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("D", "Inventario vuelve a estado 'open' tras reabrir", async () => {
    const inv = await prisma.dailyInventory.findUnique({ where: { id: dailyInventoryId } });
    return inv?.status === "open" || `status=${inv?.status}`;
  });

  console.log("\n═══ SECCIÓN E — Reportes y auditoría ═══");
  await expect("E", "SUPERADMIN puede ver reportes (200)", async () => {
    const r = await sSuper.req("GET", "/api/reports?period=all");
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("E", "ADMIN puede ver reportes (200)", async () => {
    const r = await sAdmin.req("GET", "/api/reports?period=all");
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("E", "[FIX CRÍTICO] EMPLOYEE NO puede ver reportes vía API (403) — antes no había gate", async () => {
    const r = await sEmp.req("GET", "/api/reports?period=all");
    return r.status === 403 || `status ${r.status} — VULNERABILIDAD: /api/reports sin gate de permiso`;
  });
  await expect("E", "Página /reportes: EMPLOYEE es redirigido (sin acceso)", async () => {
    const r = await sEmp.page("/reportes");
    return (r.status >= 300 && r.status < 400) || `status ${r.status}`;
  });
  await expect("E", "Página /auditoria: SUPERADMIN accede (200)", async () => {
    const r = await sSuper.page("/auditoria");
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("E", "Página /auditoria: ADMIN accede (200) — tiene AUDIT_VIEW", async () => {
    const r = await sAdmin.page("/auditoria");
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("E", "Página /auditoria: EMPLOYEE es redirigido (sin AUDIT_VIEW)", async () => {
    const r = await sEmp.page("/auditoria");
    return (r.status >= 300 && r.status < 400) || `status ${r.status}`;
  });
  await expect("E", "GET /api/inventory-permissions: SUPERADMIN accede (200)", async () => {
    const r = await sSuper.req("GET", "/api/inventory-permissions");
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("E", "GET /api/inventory-permissions: EMPLOYEE denegado (403)", async () => {
    const r = await sEmp.req("GET", "/api/inventory-permissions");
    return r.status === 403 || `status ${r.status}`;
  });

  console.log("\n═══ SECCIÓN F — Gestión de roles y usuarios (RBAC) ═══");
  await expect("F", "SUPERADMIN puede listar roles (200)", async () => {
    const r = await sSuper.req("GET", "/api/admin/roles");
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("F", "ADMIN NO puede listar roles (403) — sin USERS_MANAGE", async () => {
    const r = await sAdmin.req("GET", "/api/admin/roles");
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("F", "EMPLOYEE NO puede listar roles (403)", async () => {
    const r = await sEmp.req("GET", "/api/admin/roles");
    return r.status === 403 || `status ${r.status}`;
  });

  let testRoleId = "";
  await expect("F", "SUPERADMIN crea rol personalizado con [VIEW, STOCK_COUNT]", async () => {
    const r = await sSuper.req("POST", "/api/admin/roles", {
      name: `${E2E_TAG}ROL`, description: "Rol de prueba", permissions: ["inventory:view", "inventory:stock:count"],
    });
    if (r.status !== 201) return `status ${r.status}: ${JSON.stringify(r.json)}`;
    testRoleId = (r.json as { role: { id: string } }).role.id;
    return true;
  });
  await expect("F", "SUPERADMIN edita el rol para agregar REPORTS_VIEW", async () => {
    const r = await sSuper.req("PATCH", `/api/admin/roles/${testRoleId}`, {
      permissions: ["inventory:view", "inventory:stock:count", "inventory:reports:view"],
    });
    return r.status === 200 || `status ${r.status}`;
  });

  let testUserId = "";
  let sCustom!: Session;
  await expect("F", "SUPERADMIN crea usuario con el rol personalizado", async () => {
    const r = await sSuper.req("POST", "/api/admin/users", {
      username: "e2e_custom_user", password: "e2eClave123", role: "EMPLOYEE", customRoleId: testRoleId,
    });
    if (r.status !== 201) return `status ${r.status}: ${JSON.stringify(r.json)}`;
    testUserId = (r.json as { user: { id: string } }).user.id;
    sCustom = await loginAs("e2e_custom_user", "e2eClave123");
    return true;
  });
  await expect("F", "Usuario con rol personalizado hereda REPORTS_VIEW (200)", async () => {
    const r = await sCustom.req("GET", "/api/reports?period=all");
    return r.status === 200 || `status ${r.status} — el rol personalizado no se aplicó`;
  });
  await expect("F", "Usuario con rol personalizado NO tiene PRODUCTS_CREATE (403)", async () => {
    const barra = await prisma.category.findFirst({ where: { name: "Barra", parentId: null } });
    const r = await sCustom.req("POST", "/api/products", { name: `${E2E_TAG}NO`, categoryId: barra!.id, unit: "unidad" });
    return r.status === 403 || `status ${r.status}`;
  });
  await expect("F", "[SIN RE-LOGIN] Override 'grant' aplica en la MISMA sesión sin volver a iniciar sesión", async () => {
    await sSuper.req("PATCH", `/api/admin/users/${testUserId}`, { permsGrant: ["inventory:products:create"] });
    const barra = await prisma.category.findFirst({ where: { name: "Barra", parentId: null } });
    // sCustom sigue usando la MISMA cookie de sesión obtenida en el paso anterior.
    const r = await sCustom.req("POST", "/api/products", { name: `${E2E_TAG}SI_DEBE_EXISTIR`, categoryId: barra!.id, unit: "unidad" });
    return r.status === 201 || `status ${r.status}: ${JSON.stringify(r.json)} — el override no se aplicó sin re-login`;
  });
  await expect("F", "[SIN RE-LOGIN] Override 'revoke' quita REPORTS_VIEW en la MISMA sesión", async () => {
    await sSuper.req("PATCH", `/api/admin/users/${testUserId}`, { permsRevoke: ["inventory:reports:view"] });
    const r = await sCustom.req("GET", "/api/reports?period=all");
    return r.status === 403 || `status ${r.status} — el revoke no se aplicó sin re-login`;
  });
  await expect("F", "[FIX] Desactivar usuario le quita el acceso de inmediato (403, sin re-login) — antes GET /api/products no tenía gate", async () => {
    await sSuper.req("PATCH", `/api/admin/users/${testUserId}`, { active: false });
    const r = await sCustom.req("GET", "/api/products");
    return r.status === 403 || `status ${r.status} — VULNERABILIDAD: usuario desactivado sigue con acceso`;
  });
  await expect("F", "Rol con usuarios asignados NO se puede eliminar (409 HAS_USERS)", async () => {
    const r = await sSuper.req("DELETE", `/api/admin/roles/${testRoleId}`);
    const j = r.json as { code?: string };
    return (r.status === 409 && j.code === "HAS_USERS") || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("F", "Reactivar usuario y desasignar rol personalizado (200)", async () => {
    const r = await sSuper.req("PATCH", `/api/admin/users/${testUserId}`, { active: true, customRoleId: null, permsGrant: [], permsRevoke: [] });
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("F", "Tras reasignar, el rol ya sin usuarios SÍ se puede eliminar (200)", async () => {
    const r = await sSuper.req("DELETE", `/api/admin/roles/${testRoleId}`);
    return r.status === 200 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("F", "[FIX] Eliminar un rol ya eliminado devuelve 404 limpio (no 500)", async () => {
    const r = await sSuper.req("DELETE", `/api/admin/roles/${testRoleId}`);
    return r.status === 404 || `status ${r.status} — debería ser 404, no un crash`;
  });
  await expect("F", "Salvaguarda: no se puede quitar el rol al último SUPERADMIN activo (409)", async () => {
    const superUser = await prisma.user.findUnique({ where: { username: "superadmin" } });
    const r = await sSuper.req("PATCH", `/api/admin/users/${superUser!.id}`, { role: "ADMIN" });
    return r.status === 409 || `status ${r.status} — el sistema permitió quedarse sin SUPERADMIN`;
  });
  await expect("F", "ADMIN NO puede editar usuarios (403)", async () => {
    const r = await sAdmin.req("PATCH", `/api/admin/users/${testUserId}`, { name: "hackeado" });
    return r.status === 403 || `status ${r.status}`;
  });

  console.log("\n═══ SECCIÓN G — Perfil de usuario (self-service) ═══");
  await expect("G", "Cambiar contraseña con la contraseña actual INCORRECTA falla (401)", async () => {
    const r = await sEmp.req("PATCH", "/api/profile", { currentPassword: "clave-mala", newPassword: "nuevaClave123" });
    return r.status === 401 || `status ${r.status}`;
  });
  await expect("G", "Cambiar contraseña con la contraseña actual CORRECTA funciona (200)", async () => {
    const r = await sEmp.req("PATCH", "/api/profile", { currentPassword: "empleado123", newPassword: "empleadoTemp456" });
    return r.status === 200 || `status ${r.status}: ${JSON.stringify(r.json)}`;
  });
  await expect("G", "Login funciona con la NUEVA contraseña", async () => {
    const s = new Session();
    const ok = await s.login("empleado", "empleadoTemp456");
    return ok || "login falló con la nueva contraseña";
  });
  await expect("G", "Restaurar contraseña original de 'empleado' (housekeeping)", async () => {
    const s = await loginAs("empleado", "empleadoTemp456");
    const r = await s.req("PATCH", "/api/profile", { currentPassword: "empleadoTemp456", newPassword: "empleado123" });
    return r.status === 200 || `status ${r.status}`;
  });
  await expect("G", "No se puede tomar un username ya existente (409)", async () => {
    const r = await sAdmin.req("PATCH", "/api/profile", { currentPassword: "admin123", newUsername: "superadmin" });
    return r.status === 409 || `status ${r.status}`;
  });

  console.log("\n═══ SECCIÓN H — Sidebar filtrado por permisos (HTML server-rendered) ═══");
  await expect("H", "EMPLOYEE: el HTML del dashboard NO contiene enlace a Reportes", async () => {
    const r = await sEmp.page("/");
    return !r.html.includes('href="/reportes"') || "el enlace a Reportes aparece para EMPLOYEE";
  });
  await expect("H", "EMPLOYEE: el HTML del dashboard NO contiene enlace a Usuarios", async () => {
    const r = await sEmp.page("/");
    return !r.html.includes('href="/admin/usuarios"') || "el enlace a Usuarios aparece para EMPLOYEE";
  });
  await expect("H", "ADMIN: el HTML del dashboard SÍ contiene enlace a Reportes", async () => {
    const r = await sAdmin.page("/");
    return r.html.includes('href="/reportes"') || "falta el enlace a Reportes para ADMIN";
  });
  await expect("H", "ADMIN: el HTML del dashboard NO contiene enlace a Roles/Usuarios", async () => {
    const r = await sAdmin.page("/");
    return (!r.html.includes('href="/admin/roles"') && !r.html.includes('href="/admin/usuarios"')) || "ADMIN ve enlaces de administración de usuarios";
  });
  await expect("H", "SUPERADMIN: el HTML del dashboard contiene Roles, Usuarios, Categorías y Auditoría", async () => {
    const r = await sSuper.page("/");
    const ok = ['href="/admin/roles"', 'href="/admin/usuarios"', 'href="/admin/categorias"', 'href="/auditoria"'].every((h) => r.html.includes(h));
    return ok || "faltan enlaces de administración para SUPERADMIN";
  });

  console.log("\n═══ SECCIÓN I — Regresión: invariante de stock de botellas (Cócteles) ═══");
  await expect("I", "currentStock de productos de Cócteles = reserva + (1 si hay botella abierta)", async () => {
    const bottles = await prisma.product.findMany({
      where: { category: { slug: "cocteles" } },
      select: { name: true, currentStock: true, reserveBottles: true, bottleLevel: true },
    });
    if (bottles.length === 0) return "no hay productos de Cócteles para verificar (seed E2E no ejecutado)";
    const bad = bottles.filter((p) => p.currentStock !== (p.reserveBottles ?? 0) + (p.bottleLevel ? 1 : 0));
    return bad.length === 0 || `${bad.length} producto(s) con stock inconsistente: ${bad.map((b) => b.name).join(", ")}`;
  });

  console.log("\n═══ SECCIÓN J — Login: presencia del botón de mostrar/ocultar contraseña ═══");
  await expect("J", "El HTML de /login incluye el botón de mostrar contraseña (aria-label)", async () => {
    const anon = new Session();
    const r = await anon.page("/login");
    return r.html.includes('aria-label="Mostrar contraseña"') || "no se encontró el botón en el HTML renderizado";
  });

  // ── Limpieza final ──────────────────────────────────────────────────────────
  console.log("\n═══ Limpieza final de artefactos de prueba ═══");
  await cleanupTestArtifacts();
  console.log("✓ Artefactos de prueba eliminados");

  // ── Reporte ──────────────────────────────────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════");
  console.log("REPORTE FINAL");
  console.log("════════════════════════════════════════════════════════");
  const sections = [...new Set(results.map((r) => r.section))];
  let totalPass = 0, totalFail = 0;
  for (const sec of sections) {
    const inSec = results.filter((r) => r.section === sec);
    const pass = inSec.filter((r) => r.pass).length;
    totalPass += pass;
    totalFail += inSec.length - pass;
    console.log(`  Sección ${sec}: ${pass}/${inSec.length} OK`);
  }
  console.log(`\nTOTAL: ${totalPass}/${results.length} pruebas pasaron (${totalFail} fallaron)`);

  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log("\n✗ FALLOS DETECTADOS:");
    for (const f of failures) {
      console.log(`  [${f.section}] ${f.name}\n      → ${f.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\n✓ TODAS LAS PRUEBAS PASARON");
  }
}

main()
  .catch(async (e) => {
    console.error("\n✗ ERROR FATAL EN LA SUITE:", e);
    await cleanupTestArtifacts().catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
