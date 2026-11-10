// Base SQLite real para las pruebas de integración.
//
// IMPORTAR ESTE ARCHIVO ANTES que cualquier módulo que use `@/lib/db`: al cargarse
// copia la base plantilla (vitest.global-setup.ts) a un archivo propio de este
// archivo de prueba y apunta TURSO_DATABASE_URL hacia él. `@/lib/db` lee esa
// variable al importarse, así que el orden de los imports importa.
//
// Con una base real se prueba lo que un mock no puede: que `currentStock` y sus
// `StockMovement` cambian juntos (RN-I01) y que la suma del historial cuadra.

import { copyFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const dir = path.resolve(process.cwd(), "node_modules/.cache/inv-test");
const template = path.join(dir, "template.db");
if (!existsSync(template)) {
  throw new Error("Falta la base plantilla de pruebas: revisa `globalSetup` en vitest.config.ts");
}

const file = `test-${randomUUID()}.db`;
copyFileSync(template, path.join(dir, file));

process.env.TURSO_DATABASE_URL = `file:./node_modules/.cache/inv-test/${file}`;
// Un token del entorno del desarrollador nunca debe acompañar a la base de pruebas.
delete process.env.TURSO_AUTH_TOKEN;

// Las pruebas de integración ejercen la app con todos los módulos encendidos, como en
// Cucina dei Fiori. `@/lib/config` lee estas variables al importarse.
process.env.NEXT_PUBLIC_FEATURE_COCKTAILS = "true";
process.env.NEXT_PUBLIC_FEATURE_DAILY_INV = "true";
process.env.AUTH_MODE = "integrated";
delete process.env.APP_TIMEZONE; // America/Bogota por defecto

/** Usuario de sesión para las rutas: los permisos se pasan explícitos en cada prueba. */
export type TestUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  tenantId: string;
  inventoryAccess: boolean;
  inventoryPermissions: string[];
};

export function testUser(permissions: string[], role = "EMPLOYEE"): { user: TestUser } {
  return {
    user: {
      id: "u-test",
      username: "prueba",
      name: "Usuario de Prueba",
      role,
      tenantId: "t-test",
      inventoryAccess: true,
      inventoryPermissions: permissions,
    },
  };
}

/** Petición JSON para llamar un handler de ruta directamente. */
export function jsonRequest(method: string, body?: unknown, url = "http://localhost/api/test") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** `params` de una ruta dinámica de Next.js 16 (promesa). */
export const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
