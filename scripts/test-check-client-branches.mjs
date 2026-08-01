// scripts/test-check-client-branches.mjs
// Tests del analizador de drift de ramas puntero (puro, sin ejecutar git).
// Ejecutar: node scripts/test-check-client-branches.mjs
import { analyzeBranches } from "./check-client-branches.mjs";

let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
  if (cond) pass++; else fail++;
}

const registry = {
  clients: [
    { slug: "acme", displayName: "Acme", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "client/acme", features: [], active: true },
    { slug: "inactivo", displayName: "Inactivo", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "client/inactivo", features: [], active: false },
    { slug: "demo", displayName: "Demo", domain: "d", vercelProject: "p", tursoDatabase: "t",
      branch: "main", features: [], active: true },
  ],
};

console.log("\n── casos sanos ──");
ok("rama al día no reporta problemas",
  analyzeBranches({ registry, refs: { "client/acme": { exists: true, isAncestorOfMain: true, behind: 0 } } })
    .problems.length === 0);

ok("rama atrasada pero sin divergir NO es problema",
  analyzeBranches({ registry, refs: { "client/acme": { exists: true, isAncestorOfMain: true, behind: 7 } } })
    .problems.length === 0);

ok("el reporte menciona cuántos commits faltan",
  analyzeBranches({ registry, refs: { "client/acme": { exists: true, isAncestorOfMain: true, behind: 7 } } })
    .report.some((l) => l.includes("7")));

ok("demo (branch main) no se valida como puntero",
  analyzeBranches({ registry, refs: {} }).problems.every((p) => !p.includes("demo")));

ok("cliente inactivo se ignora",
  analyzeBranches({ registry, refs: {} }).problems.every((p) => !p.includes("inactivo")));

console.log("\n── casos que deben fallar ──");
const inexistente = analyzeBranches({ registry, refs: { "client/acme": { exists: false, isAncestorOfMain: false, behind: 0 } } });
ok("rama declarada que no existe es problema", inexistente.problems.length === 1);
ok("el problema nombra la rama", inexistente.problems[0].includes("client/acme"), inexistente.problems[0]);

const divergida = analyzeBranches({ registry, refs: { "client/acme": { exists: true, isAncestorOfMain: false, behind: 3 } } });
ok("rama divergida es problema", divergida.problems.length === 1);
ok("el problema explica que tiene commits propios",
  divergida.problems[0].includes("commits propios"), divergida.problems[0]);

ok("rama faltante en refs se trata como inexistente",
  analyzeBranches({ registry, refs: {} }).problems.length === 1);

console.log(`\n${fail === 0 ? "TODO OK" : "FALLOS"}: ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
