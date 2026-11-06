// Compuerta estática sobre TODAS las rutas de la API (I-1): ningún cuerpo se usa
// sin validar. `await req.json() as {...}` no valida nada y era la causa de los 500.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(__dirname, "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const routes = routeFiles(API_DIR).map((file) => ({
  file: path.relative(API_DIR, file).replace(/\\/g, "/"),
  src: readFileSync(file, "utf8"),
}));

describe("contrato de las rutas de la API", () => {
  it("encuentra las rutas (la compuerta no pasa en vacío)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(19);
  });

  it("ningún cuerpo con `as` en vez de validación: usar parseBody de @/lib/api-body", () => {
    const offenders = routes.filter((r) => /\.json\(\)\s*as\b/.test(r.src)).map((r) => r.file);
    expect(offenders).toEqual([]);
  });

  it("todo `req.json()` pasa por un schema (parseBody o safeParse en la misma línea)", () => {
    const offenders = routes.flatMap((r) =>
      r.src
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\b(req|request)\.json\(\)/.test(line) && !/safeParse\(/.test(line))
        .map(({ n }) => `${r.file}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
