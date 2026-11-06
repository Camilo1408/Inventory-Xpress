// scripts/test-client-registry.mjs
// Tests de scripts/lib/registry.mjs y scripts/lib/features.mjs (puros, sin I/O de red).
// Ejecutar desde la raíz del repositorio (usa rutas relativas): node scripts/test-client-registry.mjs
import { readFileSync } from "node:fs";
import { validateRegistry, clientBySlug, loadRegistry } from "./lib/registry.mjs";
import { FEATURE_ENV, KNOWN_FEATURES } from "./lib/features.mjs";

let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (cond) pass++; else fail++;
}

const validClient = {
  slug: "acme", displayName: "Acme", domain: "inv.acme.com",
  vercelProject: "inventory-xpress-acme", tursoDatabase: "inventory-acme",
  branch: "client/acme", features: ["cocktails"], active: true,
};

console.log("\n── validateRegistry ──");
ok("registro válido no reporta problemas",
  validateRegistry({ clients: [validClient] }).length === 0);

ok("rechaza raíz sin array clients",
  validateRegistry({}).some((p) => p.includes("clients")));

ok("rechaza cliente sin slug",
  validateRegistry({ clients: [{ ...validClient, slug: undefined }] }).some((p) => p.includes("slug")));

ok("rechaza branch que no sigue la convención client/<slug>",
  validateRegistry({ clients: [{ ...validClient, branch: "produccion-acme" }] })
    .some((p) => p.includes("client/acme")));

ok("rechaza feature desconocida",
  validateRegistry({ clients: [{ ...validClient, features: ["teletransporte"] }] })
    .some((p) => p.includes("teletransporte")));

ok("rechaza slugs duplicados",
  validateRegistry({ clients: [validClient, validClient] }).some((p) => p.includes("duplicado")));

ok("acepta features vacío",
  validateRegistry({ clients: [{ ...validClient, features: [] }] }).length === 0);

console.log("\n── clientBySlug ──");
const reg = { clients: [validClient] };
ok("encuentra por slug", clientBySlug(reg, "acme")?.displayName === "Acme");
ok("devuelve undefined si no existe", clientBySlug(reg, "otro") === undefined);

console.log("\n── registro real del repo ──");
const real = loadRegistry();
ok("clients/registry.json es válido", validateRegistry(real).length === 0,
  validateRegistry(real).join("; "));
ok("cucina-dei-fiori apunta a client/cucina-dei-fiori",
  clientBySlug(real, "cucina-dei-fiori")?.branch === "client/cucina-dei-fiori");
ok("demo apunta a main", clientBySlug(real, "demo")?.branch === "main");

console.log("\n── features.mjs no se desincroniza de src/lib/config.ts ──");
const configSrc = readFileSync("src/lib/config.ts", "utf8");
const envsEnConfig = new Set([...configSrc.matchAll(/process\.env\.(NEXT_PUBLIC_FEATURE_[A-Z_]+)/g)].map((m) => m[1]));
const envsEnMapa = new Set(Object.values(FEATURE_ENV));
ok("config.ts no lee ningún flag que falte en FEATURE_ENV",
  [...envsEnConfig].every((e) => envsEnMapa.has(e)),
  [...envsEnConfig].filter((e) => !envsEnMapa.has(e)).join(", "));
ok("FEATURE_ENV no declara flags que config.ts no lee",
  [...envsEnMapa].every((e) => envsEnConfig.has(e)),
  [...envsEnMapa].filter((e) => !envsEnConfig.has(e)).join(", "));
ok("KNOWN_FEATURES coincide con las claves de FEATURE_ENV",
  KNOWN_FEATURES.join(",") === Object.keys(FEATURE_ENV).join(","));

console.log(`\n${fail === 0 ? "TODO OK" : "FALLOS"}: ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
