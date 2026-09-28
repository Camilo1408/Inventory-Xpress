// scripts/test-verify-client-flags.mjs
// Tests de la verificación de flags en build (pura, sin tocar el entorno real).
// Ejecutar desde la raíz del repositorio (usa rutas relativas): node scripts/test-verify-client-flags.mjs
import { checkFlags } from "./verify-client-flags.mjs";

let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (cond) pass++; else fail++;
}

const registry = {
  clients: [
    { slug: "acme", displayName: "Acme", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "client/acme", features: ["cocktails", "dailyInventory"], active: true },
    { slug: "sinflags", displayName: "Sin Flags", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "client/sinflags", features: [], active: true },
  ],
};
const ON = { NEXT_PUBLIC_FEATURE_COCKTAILS: "true", NEXT_PUBLIC_FEATURE_DAILY_INV: "true" };

console.log("\n── cuándo se salta ──");
ok("sin ref (build local) se salta",
  checkFlags({ registry, ref: undefined, env: {} }).skipped === true);
ok("ref main se salta",
  checkFlags({ registry, ref: "main", env: {} }).skipped === true);
ok("rama de feature se salta",
  checkFlags({ registry, ref: "feat/lo-que-sea", env: {} }).skipped === true);
const fantasma = checkFlags({ registry, ref: "client/fantasma", env: {} });
ok("rama client/ sin cliente en el registro FALLA (ya no se salta)", fantasma.skipped === false);
ok("el problema explica que la rama no corresponde a ningún cliente del registro",
  fantasma.problems.length === 1 && fantasma.problems[0].includes("no corresponde a ningún cliente"),
  fantasma.problems.join("; "));
ok("el problema menciona también la causa de alta reciente sin promover",
  fantasma.problems[0].includes("recién dado de alta"),
  fantasma.problems[0]);

console.log("\n── cuándo exige ──");
ok("client/acme con ambos flags en true pasa",
  checkFlags({ registry, ref: "client/acme", env: ON }).problems.length === 0);

const faltante = checkFlags({ registry, ref: "client/acme", env: { NEXT_PUBLIC_FEATURE_COCKTAILS: "true" } });
ok("detecta flag declarada pero ausente en el entorno", faltante.problems.length === 1);
ok("el problema nombra la env var exacta",
  faltante.problems[0].includes("NEXT_PUBLIC_FEATURE_DAILY_INV"), faltante.problems[0]);

ok("detecta flag en 'false' cuando el registro la declara encendida",
  checkFlags({ registry, ref: "client/acme", env: { ...ON, NEXT_PUBLIC_FEATURE_DAILY_INV: "false" } })
    .problems.length === 1);

const sobrante = checkFlags({ registry, ref: "client/sinflags", env: ON });
ok("detecta flag encendida que el registro NO declara", sobrante.problems.length === 2);
ok("el problema de sobrante explica que no está declarada",
  sobrante.problems[0].includes("no está declarada"), sobrante.problems[0]);

ok("cliente sin features y entorno limpio pasa",
  checkFlags({ registry, ref: "client/sinflags", env: {} }).problems.length === 0);

ok("reporta el slug detectado",
  checkFlags({ registry, ref: "client/acme", env: ON }).slug === "acme");

console.log(`\n${fail === 0 ? "TODO OK" : "FALLOS"}: ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
