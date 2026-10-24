// scripts/test-promote-client.mjs
// Tests del resolutor de promoción (puro, no ejecuta git ni toca el remoto).
// Ejecutar desde la raíz del repositorio (usa rutas relativas): node scripts/test-promote-client.mjs
import { resolvePromotion } from "./promote-client.mjs";

let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (cond) pass++; else fail++;
}
function throwsWith(fn, fragment) {
  try { fn(); return false; } catch (e) { return e.message.includes(fragment); }
}

const registry = {
  clients: [
    { slug: "acme", displayName: "Acme", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "client/acme", features: [], active: true },
    { slug: "viejo", displayName: "Viejo", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "client/viejo", features: [], active: false },
    { slug: "demo", displayName: "Demo", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "main", features: [], active: true },
  ],
};

console.log("\n── resolvePromotion ──");
ok("resuelve la rama del cliente activo",
  resolvePromotion({ registry, slug: "acme" }).branch === "client/acme");
ok("devuelve también el cliente",
  resolvePromotion({ registry, slug: "acme" }).client.displayName === "Acme");
ok("rechaza slug inexistente",
  throwsWith(() => resolvePromotion({ registry, slug: "nadie" }), "no está en clients/registry.json"));
ok("rechaza cliente inactivo",
  throwsWith(() => resolvePromotion({ registry, slug: "viejo" }), "inactivo"));
ok("rechaza el demo (se despliega solo desde main)",
  throwsWith(() => resolvePromotion({ registry, slug: "demo" }), "main"));
ok("rechaza slug vacío",
  throwsWith(() => resolvePromotion({ registry, slug: "" }), "slug"));

console.log(`\n${fail === 0 ? "TODO OK" : "FALLOS"}: ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
