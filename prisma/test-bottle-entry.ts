// prisma/test-bottle-entry.ts
// Unit test puro de addBottleEntry (sin DB ni servidor).
// Ejecutar con: npx cross-env NEXT_PUBLIC_FEATURE_COCKTAILS=true tsx prisma/test-bottle-entry.ts
// (el flag no afecta a addBottleEntry, pero mantiene consistencia con el resto del feature).

import { addBottleEntry, bottleStock, type BottleLevel } from "../src/lib/bottle";

let pass = 0;
let fail = 0;

function check(
  name: string,
  got: { level: BottleLevel | null; reserve: number },
  wantLevel: BottleLevel | null,
  wantReserve: number
) {
  const ok = got.level === wantLevel && got.reserve === wantReserve;
  // Invariante clave: el stock derivado debe seguir cuadrando.
  const stock = bottleStock(got.level, got.reserve);
  const icon = ok ? "✓" : "✗";
  console.log(
    `  ${icon} ${name}  → level=${got.level ?? "null"}, reserva=${got.reserve}, stock=${stock}` +
      (ok ? "" : `   [ESPERADO level=${wantLevel ?? "null"}, reserva=${wantReserve}]`)
  );
  if (ok) pass++; else fail++;
}

console.log("═══ addBottleEntry ═══");

// Caso 1 — vacío total: se destapa 1 Llena, resto a reserva.
check("vacío + 1  (abre Llena, reserva 0)", addBottleEntry(null, 0, 1), "full", 0);
check("vacío + 3  (abre Llena, reserva 2)", addBottleEntry(null, 0, 3), "full", 2);

// Caso 2 — hay botella abierta con estado: todo va a reserva, nivel intacto.
check("almost_empty + 2 (reserva sube)", addBottleEntry("almost_empty", 0, 2), "almost_empty", 2);
check("full + 2 (reserva 4→6)", addBottleEntry("full", 4, 2), "full", 6);
check("half + 1 (reserva 0→1)", addBottleEntry("half", 0, 1), "half", 1);

// Caso 3 — estado raro: sin botella pero con reserva > 0 → NO abre, suma a reserva.
check("null + reserva 2, +1 (no abre)", addBottleEntry(null, 2, 1), null, 3);

// Caso 4 — reserve nulo/undefined tratado como 0.
check("null + reserva undefined, +2 (abre Llena, reserva 1)", addBottleEntry(null, undefined, 2), "full", 1);
check("full + reserva null, +1 (reserva 0→1)", addBottleEntry("full", null, 1), "full", 1);

console.log(`\nTOTAL: ${pass}/${pass + fail} OK`);
if (fail > 0) process.exit(1);
