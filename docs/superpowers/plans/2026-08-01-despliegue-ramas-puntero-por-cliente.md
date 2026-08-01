# Despliegue por ramas puntero por cliente — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Goal:** Que cada cliente de Inventory Xpress despliegue desde su propia rama puntero `client/<slug>` en vez de `main`, con sus funcionalidades activadas/desactivadas por feature flags declarados en `clients/registry.json` y verificados en cada build.

**Architecture:** Se replica el modelo ya probado en Nómina Xpress: `main` es la única rama de desarrollo y solo despliega al demo; cada cliente tiene una rama `client/<slug>` que **no contiene código propio** y solo avanza por fast-forward desde `main`. Toda diferencia entre clientes vive en env vars de Vercel. Sobre ese modelo se añaden tres guardas que Nómina no tiene: un validador de que ninguna rama de cliente divergió, una verificación en tiempo de build de que los flags del entorno coinciden con lo declarado en el registro, y un Ignored Build Step que evita builds inútiles.

**Tech Stack:** Node 20 (scripts `.mjs`, ESM), GitHub Actions, Vercel (Production Branch + Ignored Build Step), Next.js 16, pnpm.

## Global Constraints

- **Las ramas `client/<slug>` nunca llevan commits propios.** Su única mutación permitida es un fast-forward desde `main`. Cualquier diferencia por cliente se resuelve con env vars/feature flags, nunca con código.
- **Los scripts nuevos son `.mjs` ESM en `scripts/`**, siguiendo el estilo de `scripts/backup-preflight.mjs`: docstring de cabecera con uso y variables requeridas, `console.error` para diagnósticos, códigos de salida explícitos.
- **Cada script separa lógica pura de I/O:** las funciones exportadas son puras y testeables; el CLI vive al final del archivo tras `if (import.meta.url === pathToFileURL(process.argv[1]).href)`.
- **No hay framework de tests.** Los tests son scripts ejecutables con contador `pass`/`fail` y `process.exit(fail ? 1 : 0)`, siguiendo el patrón de `prisma/test-movement-edit.ts` (función `ok(name, cond, detail)`).
- **Nunca imprimir secretos.** Los scripts manejan slugs, ramas y nombres de env vars; jamás valores de tokens.
- **TypeScript strict sin `any`** en cualquier archivo `.ts` que se toque.
- **`clients/registry.json` es la fuente de verdad** de qué clientes existen, en qué rama despliegan y qué features tienen encendidas.
- Slugs actuales: `cucina-dei-fiori` (proyecto Vercel `inventory-xpress-fiori`, modo `integrated`) y `demo` (proyecto `inventory-xpress-demo`, modo `standalone`).

---

## Contexto verificado (2026-08-01)

Datos comprobados contra la API de Vercel y los repos, no contra la documentación:

| Proyecto Vercel | Repo | Production Branch hoy | Debe quedar en |
|---|---|---|---|
| `inventory-xpress-demo` | `Camilo1408/Inventory-Xpress` | `main` | `main` (sin cambio) |
| `inventory-xpress-fiori` | `Camilo1408/Inventory-Xpress` | **`main`** ⚠️ | **`client/cucina-fiori`** |
| `cucina-fiori` (Nómina, referencia) | `Camilo1408/Nomina-Xpress` | `client/cucina-fiori` | — |

- Los dominios de ambos proyectos tienen `gitBranch: null`, o sea **siguen a la Production Branch**: al repuntar la rama, el dominio se mueve solo. No hay que tocar DNS.
- `commandForIgnoringBuildStep` está **sin definir** en ambos proyectos: hoy cada push a cualquier rama construye en los dos proyectos.
- Env vars por proyecto (solo nombres; los valores son secretos):
  - `inventory-xpress-demo` (8, target Production): `AUTH_MODE`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXT_PUBLIC_FEATURE_COCKTAILS`, `NEXT_PUBLIC_FEATURE_DAILY_INV`, `BLOB_READ_WRITE_TOKEN`.
  - `inventory-xpress-fiori` (11, target Production+Preview): las 8 anteriores más `AUTH_COOKIE_DOMAIN`, `NOMINA_APP_URL`, `NEXT_PUBLIC_NOMINA_APP_URL`.
- **Desfase de documentación detectado:** `.env.example` y `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` §9 documentan `ROOT_DOMAIN`, que **no existe en el código**; el código usa `AUTH_COOKIE_DOMAIN` (`src/lib/auth.config.ts:10`). Además `APP_TIMEZONE` (`src/lib/config.ts:13`) no está documentado en ninguno de los dos. Se corrige en la Tarea 5.
- `clients/registry.json` solo lo consume `scripts/backup-preflight.mjs`; ningún código de runtime lo lee. Añadirle campos es de bajo riesgo.
- El workflow `.github/workflows/backup-db.yml` se dispara por `schedule` y es agnóstico de rama: **esta migración no lo afecta**. No se toca.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `clients/registry.json` (modificar) | Añade `branch` por cliente. Fuente de verdad de slug → rama → features. |
| `scripts/lib/features.mjs` (crear) | Mapa único feature → env var, del lado de los scripts. Espejo de `src/lib/config.ts`. |
| `scripts/lib/registry.mjs` (crear) | Carga y valida la forma de `clients/registry.json`. Usado por los tres scripts nuevos. |
| `scripts/check-client-branches.mjs` (crear) | Detecta drift: toda rama de cliente debe ser ancestro de `main`. |
| `scripts/verify-client-flags.mjs` (crear) | Corre en cada build de Vercel: si la rama es `client/<slug>`, exige que los flags del entorno coincidan con el registro. |
| `scripts/promote-client.mjs` (crear) | Promueve `main` → `client/<slug>` con fast-forward y confirmación explícita. |
| `scripts/test-client-registry.mjs` (crear) | Tests de `lib/registry.mjs` y `lib/features.mjs`. |
| `scripts/test-check-client-branches.mjs` (crear) | Tests del analizador de drift. |
| `scripts/test-verify-client-flags.mjs` (crear) | Tests del verificador de flags. |
| `scripts/test-promote-client.mjs` (crear) | Tests del resolutor de promoción. |
| `package.json` (modificar) | `build` ejecuta la verificación de flags antes de compilar. |
| `.github/workflows/client-branches.yml` (crear) | Corre el validador de drift en cada push a `main` y en PRs. |
| `.env.example` (modificar) | Corrige `ROOT_DOMAIN` → `AUTH_COOKIE_DOMAIN`, añade `APP_TIMEZONE`. |
| `docs/runbooks/releases-y-multicliente.md` (reescribir) | Runbook del modelo nuevo. |
| `scripts/provision-client.mjs` (modificar) | El alta de cliente crea la rama puntero y registra `branch`. |
| `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` (modificar) | §9 matriz de env vars, §22 despliegue. |
| `CLAUDE.md` (modificar) | Regla no negociable sobre ramas puntero. |

---

### Task 1: Registro de clientes con rama puntero y librerías compartidas

**Files:**
- Modify: `clients/registry.json`
- Create: `scripts/lib/registry.mjs`
- Create: `scripts/lib/features.mjs`
- Test: `scripts/test-client-registry.mjs`

**Interfaces:**
- Produces:
  - `loadRegistry(path?: string): { clients: Client[] }` — lee y valida; lanza `Error` con mensaje accionable si la forma es inválida.
  - `validateRegistry(data: unknown): string[]` — puro; devuelve lista de problemas (vacía = válido).
  - `clientBySlug(registry, slug): Client | undefined` — puro.
  - `Client = { slug, displayName, domain, vercelProject, tursoDatabase, branch, features, active }`
  - `FEATURE_ENV: Record<string, string>` — `{ cocktails: "NEXT_PUBLIC_FEATURE_COCKTAILS", dailyInventory: "NEXT_PUBLIC_FEATURE_DAILY_INV" }`
  - `KNOWN_FEATURES: string[]` — claves de `FEATURE_ENV`.

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test-client-registry.mjs`:

```javascript
// scripts/test-client-registry.mjs
// Tests de scripts/lib/registry.mjs y scripts/lib/features.mjs (puros, sin I/O de red).
// Ejecutar: node scripts/test-client-registry.mjs
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node scripts/test-client-registry.mjs`
Expected: FAIL — `Cannot find module ... scripts/lib/registry.mjs`

- [ ] **Step 3: Crear `scripts/lib/features.mjs`**

```javascript
// scripts/lib/features.mjs
// Mapa único feature -> env var del lado de los scripts.
// ESPEJO de src/lib/config.ts: si allí se agrega un flag NEXT_PUBLIC_FEATURE_*,
// hay que agregarlo aquí. scripts/test-client-registry.mjs falla si se desincronizan.

/** Nombre en clients/registry.json -> env var que lo enciende en Vercel. */
export const FEATURE_ENV = {
  cocktails: "NEXT_PUBLIC_FEATURE_COCKTAILS",
  dailyInventory: "NEXT_PUBLIC_FEATURE_DAILY_INV",
};

/** Features válidas en el campo `features` del registro. */
export const KNOWN_FEATURES = Object.keys(FEATURE_ENV);
```

- [ ] **Step 4: Crear `scripts/lib/registry.mjs`**

```javascript
// scripts/lib/registry.mjs
// Carga y validación de clients/registry.json — la fuente de verdad de qué
// clientes existen, desde qué rama despliegan y qué features tienen encendidas.
// Sin I/O de red: solo lee el archivo. Las funciones de validación son puras.

import { readFileSync } from "node:fs";
import { KNOWN_FEATURES } from "./features.mjs";

const REQUIRED_STRINGS = ["slug", "displayName", "domain", "vercelProject", "tursoDatabase", "branch"];

/**
 * Valida la forma del registro. Puro: no toca disco ni red.
 * @returns {string[]} lista de problemas; vacía significa válido.
 */
export function validateRegistry(data) {
  const problems = [];
  if (!data || typeof data !== "object" || !Array.isArray(data.clients)) {
    return ['El registro debe ser un objeto con un array "clients".'];
  }
  const seen = new Set();
  for (const [i, c] of data.clients.entries()) {
    const label = c?.slug ? `cliente "${c.slug}"` : `cliente #${i}`;
    for (const field of REQUIRED_STRINGS) {
      if (typeof c?.[field] !== "string" || c[field].trim() === "") {
        problems.push(`${label}: falta el campo obligatorio "${field}" (string no vacío).`);
      }
    }
    if (typeof c?.active !== "boolean") {
      problems.push(`${label}: "active" debe ser booleano.`);
    }
    if (!Array.isArray(c?.features)) {
      problems.push(`${label}: "features" debe ser un array.`);
    } else {
      for (const f of c.features) {
        if (!KNOWN_FEATURES.includes(f)) {
          problems.push(`${label}: feature desconocida "${f}". Válidas: ${KNOWN_FEATURES.join(", ")}.`);
        }
      }
    }
    if (typeof c?.slug === "string") {
      if (seen.has(c.slug)) problems.push(`slug duplicado: "${c.slug}".`);
      seen.add(c.slug);
      // El demo despliega desde main; los clientes reales desde su rama puntero.
      const expected = c.slug === "demo" ? "main" : `client/${c.slug}`;
      if (typeof c.branch === "string" && c.branch !== expected) {
        problems.push(`${label}: "branch" debe ser "${expected}", no "${c.branch}".`);
      }
    }
  }
  return problems;
}

/** Lee el registro del disco y lo valida. Lanza si es inválido. */
export function loadRegistry(path = "clients/registry.json") {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`No se pudo leer ${path}: ${e.message}`);
  }
  const problems = validateRegistry(parsed);
  if (problems.length > 0) {
    throw new Error(`${path} es inválido:\n  - ${problems.join("\n  - ")}`);
  }
  return parsed;
}

/** Busca un cliente por slug. Puro. */
export function clientBySlug(registry, slug) {
  return registry.clients.find((c) => c.slug === slug);
}
```

- [ ] **Step 5: Añadir `branch` a `clients/registry.json`**

Reemplazar el contenido completo por:

```json
{
  "clients": [
    {
      "slug": "cucina-dei-fiori",
      "displayName": "Cucina dei Fiori",
      "domain": "inventario.cucinadeifiori.com",
      "vercelProject": "inventory-xpress-fiori",
      "tursoDatabase": "inventory-xpress-fiori-camilo1408",
      "branch": "client/cucina-dei-fiori",
      "features": ["cocktails", "dailyInventory"],
      "active": true
    },
    {
      "slug": "demo",
      "displayName": "Demo",
      "domain": "inventory-xpress-demo.vercel.app",
      "vercelProject": "inventory-xpress-demo",
      "tursoDatabase": "inventory-xpress-demo-camilo1408",
      "branch": "main",
      "features": ["cocktails", "dailyInventory"],
      "active": true
    }
  ]
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `node scripts/test-client-registry.mjs`
Expected: PASS — `TODO OK: 15 pasaron, 0 fallaron`

- [ ] **Step 7: Verificar que el preflight de backup sigue funcionando**

El preflight lee el mismo registro; los campos nuevos no deben romperlo.

Run:
```bash
DB_TARGETS='[{"name":"demo","url":"libsql://x","token":"t"},{"name":"cucina-dei-fiori","url":"libsql://y","token":"t"}]' node scripts/backup-preflight.mjs
```
Expected: `Preflight OK: 2 clientes active cubiertos por DB_TARGETS.` y exit 0.

- [ ] **Step 8: Commit**

```bash
git add clients/registry.json scripts/lib/features.mjs scripts/lib/registry.mjs scripts/test-client-registry.mjs
git commit -m "feat(multicliente): registro con rama puntero por cliente y validacion de forma"
```

---

### Task 2: Verificación de flags en tiempo de build

Esta es la guarda que evita el fallo histórico documentado en el runbook viejo: desplegar Fiori sin `NEXT_PUBLIC_FEATURE_COCKTAILS`/`NEXT_PUBLIC_FEATURE_DAILY_INV` y perder cócteles e inventario diario en producción del cliente.

**Files:**
- Create: `scripts/verify-client-flags.mjs`
- Test: `scripts/test-verify-client-flags.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadRegistry`, `clientBySlug` (Task 1), `FEATURE_ENV` (Task 1).
- Produces: `checkFlags({ registry, ref, env }): { skipped: boolean, reason?: string, slug?: string, problems: string[] }` — puro.

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test-verify-client-flags.mjs`:

```javascript
// scripts/test-verify-client-flags.mjs
// Tests de la verificación de flags en build (pura, sin tocar el entorno real).
// Ejecutar: node scripts/test-verify-client-flags.mjs
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
ok("rama client/ sin cliente en el registro se salta con motivo",
  checkFlags({ registry, ref: "client/fantasma", env: {} }).skipped === true);

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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node scripts/test-verify-client-flags.mjs`
Expected: FAIL — `Cannot find module ... scripts/verify-client-flags.mjs`

- [ ] **Step 3: Crear `scripts/verify-client-flags.mjs`**

```javascript
// scripts/verify-client-flags.mjs
// Corre al inicio de `pnpm build`. Si el build es de una rama puntero de cliente
// (client/<slug>), exige que los feature flags del entorno coincidan EXACTAMENTE
// con los declarados en clients/registry.json para ese cliente. Falla el build si no.
//
// Evita el fallo histórico: desplegar un cliente sin sus flags y apagarle en
// producción funciones que sí tenía (cócteles, inventario diario).
//
// Es no-op en builds locales, de demo (main) y de ramas de feature.
//
// Variables leídas: VERCEL_GIT_COMMIT_REF (la expone Vercel en build),
//                   NEXT_PUBLIC_FEATURE_* (los flags a verificar).
// Uso: node scripts/verify-client-flags.mjs

import { pathToFileURL } from "node:url";
import { loadRegistry, clientBySlug } from "./lib/registry.mjs";
import { FEATURE_ENV } from "./lib/features.mjs";

/**
 * Compara los flags del entorno contra los declarados en el registro. Puro.
 * @returns {{skipped: boolean, reason?: string, slug?: string, problems: string[]}}
 */
export function checkFlags({ registry, ref, env }) {
  if (!ref || !ref.startsWith("client/")) {
    return { skipped: true, reason: `la rama "${ref ?? "(sin rama)"}" no es de cliente`, problems: [] };
  }
  const slug = ref.slice("client/".length);
  const client = clientBySlug(registry, slug);
  if (!client) {
    return { skipped: true, reason: `"${slug}" no está en clients/registry.json`, problems: [] };
  }

  const problems = [];
  const declared = new Set(client.features);
  for (const [feature, envVar] of Object.entries(FEATURE_ENV)) {
    const encendida = env[envVar] === "true";
    if (declared.has(feature) && !encendida) {
      problems.push(
        `${envVar} debe valer "true" (el registro declara "${feature}" para ${slug}), pero vale "${env[envVar] ?? "(sin definir)"}".`
      );
    }
    if (!declared.has(feature) && encendida) {
      problems.push(
        `${envVar} está en "true" pero la feature "${feature}" no está declarada para ${slug} en clients/registry.json.`
      );
    }
  }
  return { skipped: false, slug, problems };
}

function main() {
  const registry = loadRegistry();
  const result = checkFlags({
    registry,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
    env: process.env,
  });

  if (result.skipped) {
    console.error(`verify-client-flags: sin verificación — ${result.reason}.`);
    return;
  }
  if (result.problems.length > 0) {
    console.error(`::error::Los feature flags de "${result.slug}" no coinciden con clients/registry.json:`);
    for (const p of result.problems) console.error(`::error::  - ${p}`);
    console.error("::error::Corrige las Environment Variables del proyecto en Vercel, o el registro, y vuelve a desplegar.");
    process.exit(1);
  }
  console.error(`verify-client-flags: OK — flags de "${result.slug}" coinciden con el registro.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node scripts/test-verify-client-flags.mjs`
Expected: PASS — `TODO OK: 12 pasaron, 0 fallaron`

- [ ] **Step 5: Conectar la verificación al build**

En `package.json`, reemplazar la línea del script `build`:

```json
    "build": "node scripts/verify-client-flags.mjs && prisma generate && next build",
```

- [ ] **Step 6: Verificar que el build local sigue funcionando (caso no-op)**

Run: `pnpm build`
Expected: primero imprime `verify-client-flags: sin verificación — la rama "(sin rama)" no es de cliente.` y luego el build de Next termina en verde.

- [ ] **Step 7: Verificar el caso que debe fallar**

Simular un build de Fiori sin sus flags:

```bash
VERCEL_GIT_COMMIT_REF=client/cucina-dei-fiori node scripts/verify-client-flags.mjs; echo "exit=$?"
```
Expected: dos líneas `::error::` nombrando `NEXT_PUBLIC_FEATURE_COCKTAILS` y `NEXT_PUBLIC_FEATURE_DAILY_INV`, y `exit=1`.

Y el caso correcto:

```bash
VERCEL_GIT_COMMIT_REF=client/cucina-dei-fiori NEXT_PUBLIC_FEATURE_COCKTAILS=true NEXT_PUBLIC_FEATURE_DAILY_INV=true node scripts/verify-client-flags.mjs; echo "exit=$?"
```
Expected: `verify-client-flags: OK — flags de "cucina-dei-fiori" coinciden con el registro.` y `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-client-flags.mjs scripts/test-verify-client-flags.mjs package.json
git commit -m "feat(multicliente): falla el build si los flags del cliente no coinciden con el registro"
```

---

### Task 3: Validador de drift de ramas puntero

**Files:**
- Create: `scripts/check-client-branches.mjs`
- Test: `scripts/test-check-client-branches.mjs`

**Interfaces:**
- Consumes: `loadRegistry` (Task 1).
- Produces: `analyzeBranches({ registry, refs }): { problems: string[], report: string[] }` — puro.
  `refs` es `Record<string, { exists: boolean, isAncestorOfMain: boolean, behind: number }>` indexado por nombre de rama.

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test-check-client-branches.mjs`:

```javascript
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node scripts/test-check-client-branches.mjs`
Expected: FAIL — `Cannot find module ... scripts/check-client-branches.mjs`

- [ ] **Step 3: Crear `scripts/check-client-branches.mjs`**

```javascript
// scripts/check-client-branches.mjs
// Guarda del modelo de ramas puntero: toda rama client/<slug> declarada en
// clients/registry.json debe existir y ser ANCESTRO de main, es decir, no tener
// commits propios. Si diverge, el fast-forward de la promoción fallaría y el
// cliente quedaría con código que no está en main (justo lo que pasó con la
// vieja rama deploy-fiori).
//
// Estar atrasada respecto a main NO es un error: es el estado normal entre releases.
//
// Uso: node scripts/check-client-branches.mjs
// Requiere un checkout con los refs remotos disponibles (git fetch previo).

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadRegistry } from "./lib/registry.mjs";

/**
 * Analiza el estado de las ramas puntero. Puro: recibe los datos de git ya resueltos.
 * @param {{registry: object, refs: Record<string, {exists: boolean, isAncestorOfMain: boolean, behind: number}>}} input
 * @returns {{problems: string[], report: string[]}}
 */
export function analyzeBranches({ registry, refs }) {
  const problems = [];
  const report = [];
  for (const client of registry.clients) {
    if (!client.active) continue;
    if (client.branch === "main") continue; // el demo no es puntero
    const info = refs[client.branch] ?? { exists: false, isAncestorOfMain: false, behind: 0 };

    if (!info.exists) {
      problems.push(
        `${client.slug}: la rama "${client.branch}" no existe en el remoto. Créala con: git push origin main:${client.branch}`
      );
      continue;
    }
    if (!info.isAncestorOfMain) {
      problems.push(
        `${client.slug}: la rama "${client.branch}" tiene commits propios que no están en main (divergió). ` +
        `Las ramas puntero no llevan código propio: mueve esos cambios a main o descártalos.`
      );
      continue;
    }
    report.push(
      info.behind === 0
        ? `${client.slug}: "${client.branch}" al día con main.`
        : `${client.slug}: "${client.branch}" ${info.behind} commit(s) detrás de main (pendiente de promover).`
    );
  }
  return { problems, report };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Resuelve el estado real de una rama contra origin/main. */
function inspectBranch(branch) {
  const remoteRef = `refs/remotes/origin/${branch.replace(/^refs\/heads\//, "")}`;
  let exists = true;
  try {
    git(["rev-parse", "--verify", "--quiet", remoteRef]);
  } catch {
    exists = false;
  }
  if (!exists) return { exists: false, isAncestorOfMain: false, behind: 0 };

  let isAncestorOfMain = true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", remoteRef, "refs/remotes/origin/main"], { stdio: "ignore" });
  } catch {
    isAncestorOfMain = false;
  }
  const behind = Number(git(["rev-list", "--count", `${remoteRef}..refs/remotes/origin/main`]));
  return { exists, isAncestorOfMain, behind };
}

function main() {
  const registry = loadRegistry();
  const refs = {};
  for (const client of registry.clients) {
    if (!client.active || client.branch === "main") continue;
    refs[client.branch] = inspectBranch(client.branch);
  }

  const { problems, report } = analyzeBranches({ registry, refs });
  for (const line of report) console.error(`  ${line}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.error(`check-client-branches: OK — ${report.length} rama(s) puntero sin divergencias.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node scripts/test-check-client-branches.mjs`
Expected: PASS — `TODO OK: 10 pasaron, 0 fallaron`

- [ ] **Step 5: Verificar el CLI contra el repo real**

Antes de que existan las ramas puntero (se crean en la Tarea 8), el script debe reportar la ausencia:

```bash
git fetch origin --prune
node scripts/check-client-branches.mjs; echo "exit=$?"
```
Expected: `::error::cucina-dei-fiori: la rama "client/cucina-dei-fiori" no existe en el remoto...` y `exit=1`. Es el resultado correcto en este punto del plan.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-client-branches.mjs scripts/test-check-client-branches.mjs
git commit -m "feat(multicliente): validador de ramas puntero sin divergencia"
```

---

### Task 4: Script de promoción a cliente

**Files:**
- Create: `scripts/promote-client.mjs`
- Test: `scripts/test-promote-client.mjs`

**Interfaces:**
- Consumes: `loadRegistry`, `clientBySlug` (Task 1).
- Produces: `resolvePromotion({ registry, slug }): { branch: string, client: object }` — puro; lanza `Error` con mensaje accionable si el slug no existe, está inactivo, o es el demo.

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test-promote-client.mjs`:

```javascript
// scripts/test-promote-client.mjs
// Tests del resolutor de promoción (puro, no ejecuta git ni toca el remoto).
// Ejecutar: node scripts/test-promote-client.mjs
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node scripts/test-promote-client.mjs`
Expected: FAIL — `Cannot find module ... scripts/promote-client.mjs`

- [ ] **Step 3: Crear `scripts/promote-client.mjs`**

```javascript
// scripts/promote-client.mjs
// Promueve el main verificado en demo a la rama puntero de un cliente.
// Empuja el sha de origin/main directamente al ref del cliente: GitHub rechaza
// el push si no es fast-forward, así que el drift queda bloqueado por el servidor
// (no depende de la disciplina de quien lo corre).
//
// Uso:  node scripts/promote-client.mjs <slug>          (muestra qué se promovería)
//       node scripts/promote-client.mjs <slug> --si     (ejecuta el push)

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadRegistry, clientBySlug } from "./lib/registry.mjs";

/**
 * Resuelve a qué rama hay que promover. Puro.
 * @returns {{branch: string, client: object}}
 */
export function resolvePromotion({ registry, slug }) {
  if (!slug) {
    throw new Error("Falta el slug del cliente. Uso: node scripts/promote-client.mjs <slug> [--si]");
  }
  const client = clientBySlug(registry, slug);
  if (!client) {
    throw new Error(`El cliente "${slug}" no está en clients/registry.json.`);
  }
  if (!client.active) {
    throw new Error(`El cliente "${slug}" está inactivo en el registro; no se promueve.`);
  }
  if (client.branch === "main") {
    throw new Error(`"${slug}" despliega desde main (es el demo): se actualiza solo al mergear a main.`);
  }
  return { branch: client.branch, client };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const slug = process.argv[2];
  const confirmed = process.argv.includes("--si");
  const { branch, client } = resolvePromotion({ registry: loadRegistry(), slug });

  git(["fetch", "origin", "--prune"]);
  const mainSha = git(["rev-parse", "refs/remotes/origin/main"]);

  let pending;
  try {
    pending = git(["log", "--oneline", `refs/remotes/origin/${branch}..refs/remotes/origin/main`]);
  } catch {
    console.error(`::error::La rama "${branch}" no existe en el remoto. Créala con: git push origin main:${branch}`);
    process.exit(1);
  }

  if (pending === "") {
    console.error(`"${client.displayName}" ya está en el último main (${mainSha.slice(0, 7)}). Nada que promover.`);
    return;
  }

  console.error(`\nSe promoverá a ${client.displayName} (${branch}) el commit ${mainSha.slice(0, 7)}.`);
  console.error(`Producción del cliente: https://${client.domain}`);
  console.error(`\nCommits que entran:\n${pending}\n`);

  if (!confirmed) {
    console.error("Simulación. Para ejecutarlo de verdad, repite el comando con --si:");
    console.error(`  node scripts/promote-client.mjs ${slug} --si`);
    return;
  }

  // GitHub rechaza el push si no es fast-forward. No usamos --force nunca.
  execFileSync("git", ["push", "origin", `${mainSha}:refs/heads/${branch}`], { stdio: "inherit" });
  console.error(`\nListo. Vercel desplegará ${client.vercelProject} desde ${branch}.`);
  console.error(`Verifica en https://${client.domain} antes de dar por cerrado el release.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node scripts/test-promote-client.mjs`
Expected: PASS — `TODO OK: 6 pasaron, 0 fallaron`

- [ ] **Step 5: Verificar que el CLI rechaza el demo**

Run: `node scripts/promote-client.mjs demo`
Expected: error `"demo" despliega desde main (es el demo)...` y exit distinto de 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/promote-client.mjs scripts/test-promote-client.mjs
git commit -m "feat(multicliente): script de promocion main -> rama de cliente por fast-forward"
```

---

### Task 5: Guardas en CI y corrección de la matriz de env vars

**Files:**
- Create: `.github/workflows/client-branches.yml`
- Modify: `.env.example`
- Modify: `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` (§9, tabla de variables de entorno)

**Interfaces:**
- Consumes: `scripts/check-client-branches.mjs` (Task 3), `scripts/test-*.mjs` (Tasks 1–4).

- [ ] **Step 1: Crear el workflow de guarda**

Crear `.github/workflows/client-branches.yml`:

```yaml
name: Ramas puntero de cliente

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verificar:
    name: Registro, flags y ramas puntero
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
        with:
          # Necesario para merge-base contra origin/main y los refs de cliente.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Traer los refs remotos
        run: git fetch origin --prune

      - name: Tests de las herramientas multi-cliente
        run: |
          node scripts/test-client-registry.mjs
          node scripts/test-verify-client-flags.mjs
          node scripts/test-check-client-branches.mjs
          node scripts/test-promote-client.mjs

      - name: Ninguna rama de cliente divergió de main
        run: node scripts/check-client-branches.mjs
```

- [ ] **Step 2: Verificar los tests localmente igual que en CI**

Run:
```bash
node scripts/test-client-registry.mjs && node scripts/test-verify-client-flags.mjs && node scripts/test-check-client-branches.mjs && node scripts/test-promote-client.mjs
```
Expected: cuatro bloques `TODO OK`, exit 0.

- [ ] **Step 3: Corregir `.env.example`**

Reemplazar el bloque de `ROOT_DOMAIN` (líneas 21-22) por el nombre real que lee el código, y documentar la zona horaria. El bloque queda:

```bash
# Solo en producción integrada — dominio de la cookie compartida con Nómina.
# Lo lee src/lib/auth.config.ts. Ej: ".cucinadeifiori.com" (con punto inicial).
# AUTH_COOKIE_DOMAIN=.mirestaurante.com

# Zona horaria del negocio (IANA). Define cuándo empieza y termina la jornada
# operativa; por defecto "America/Bogota". Lo lee src/lib/config.ts.
# APP_TIMEZONE=America/Bogota
```

- [ ] **Step 4: Corregir la tabla de variables de entorno de la doc técnica**

En `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` §9, sustituir la fila de `ROOT_DOMAIN` por estas dos:

```markdown
| `AUTH_COOKIE_DOMAIN` | integrated/prod | Dominio de la cookie de sesión compartida con Nómina (ej. `.cucinadeifiori.com`). Lo lee `src/lib/auth.config.ts`. |
| `APP_TIMEZONE` | opcional | Zona horaria IANA del negocio para el cálculo de la jornada (def. `America/Bogota`). |
```

- [ ] **Step 5: Verificar que no queda ninguna referencia a `ROOT_DOMAIN`**

Se excluye `docs/superpowers/` a propósito: los planes y specs son registro histórico y
mencionan el nombre viejo al describir esta misma corrección.

Run: `grep -rn "ROOT_DOMAIN" --include="*.md" --include="*.example" --include="*.ts" . | grep -v node_modules | grep -v "docs/superpowers/"`
Expected: sin resultados.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/client-branches.yml .env.example DOCUMENTACION_COMPLETA_DEL_PROYECTO.md
git commit -m "ci(multicliente): guarda de ramas puntero y correccion de la matriz de env vars"
```

---

### Task 6: Alta de cliente nuevo con rama puntero

**Files:**
- Modify: `scripts/provision-client.mjs:63-73` (bloque de checklist final)

**Interfaces:**
- Consumes: la convención `client/<slug>` (Task 1).

- [ ] **Step 1: Actualizar el checklist que imprime el script**

En `scripts/provision-client.mjs`, reemplazar el bloque completo desde `console.log("\n─── LISTO. Pasos manuales restantes ───");` hasta el cierre de `main()` por:

```javascript
  const branch = `client/${slug}`;
  const secretName = `TURSO_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`;

  console.log("\n─── LISTO. Pasos manuales restantes ───");
  console.log(`1. Crear la rama puntero del cliente (sin código propio, solo avanza por fast-forward):`);
  console.log(`     git fetch origin && git push origin origin/main:refs/heads/${branch}`);
  console.log(`2. Agregar la entrada en clients/registry.json:`);
  console.log(`     { "slug": "${slug}", "displayName": "...", "domain": "...",`);
  console.log(`       "vercelProject": "inventory-xpress-${slug}", "tursoDatabase": "${dbName}",`);
  console.log(`       "branch": "${branch}", "features": [], "active": true }`);
  console.log(`     Las features válidas hoy son: cocktails, dailyInventory.`);
  console.log(`3. Crear el proyecto Vercel enlazado al repo con Production Branch = ${branch}.`);
  console.log(`4. Setear env vars en ese proyecto (target Production):`);
  console.log(`     TURSO_DATABASE_URL=${url}`);
  console.log(`     TURSO_AUTH_TOKEN=<el token emitido arriba>`);
  console.log(`     NEXTAUTH_SECRET=<genera uno único>`);
  console.log(`     NEXTAUTH_URL=<url pública del cliente>`);
  console.log(`     AUTH_MODE=standalone`);
  console.log(`     Un flag por cada feature declarada en el registro; si no coinciden, el build FALLA:`);
  console.log(`       cocktails      -> NEXT_PUBLIC_FEATURE_COCKTAILS=true`);
  console.log(`       dailyInventory -> NEXT_PUBLIC_FEATURE_DAILY_INV=true`);
  console.log(`5. Ignored Build Step del proyecto (Settings -> Git), para no construir otras ramas:`);
  console.log(`     if [ "$VERCEL_GIT_COMMIT_REF" = "${branch}" ]; then exit 1; else exit 0; fi`);
  console.log(`6. Configurar el subdominio + CNAME en DNS.`);
  console.log(`7. Guardar el token de la BD como secret de GitHub: ${secretName}`);
  console.log(`8. Añadir el cliente al secret DB_TARGETS para que entre en el backup semanal.`);
  console.log(`9. Verificar: node scripts/check-client-branches.mjs`);
}
```

- [ ] **Step 2: Verificar que el script sigue siendo válido**

No se puede correr sin credenciales de Turso, pero sí validar que parsea:

Run: `node --check scripts/provision-client.mjs && echo "sintaxis OK"`
Expected: `sintaxis OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-client.mjs
git commit -m "feat(multicliente): el alta de cliente crea rama puntero y declara sus flags"
```

---

### Task 7: Reescribir el runbook y la documentación de despliegue

El runbook actual describe un flujo de "promoción de build" que nunca existió; hay que reemplazarlo, no parchearlo.

**Files:**
- Rewrite: `docs/runbooks/releases-y-multicliente.md`
- Modify: `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` (§22 Despliegue y producción)
- Modify: `CLAUDE.md` (Reglas No Negociables)
- Modify: `docs/README.md` (índice, si cambia la descripción del runbook)

- [ ] **Step 1: Reescribir el runbook completo**

Reemplazar todo el contenido de `docs/runbooks/releases-y-multicliente.md` por:

````markdown
# Runbook: Releases y modelo multi-cliente

Inventory Xpress se despliega **una instancia por cliente**, todas desde el mismo código
(`main`). La diferencia entre clientes es **configuración** (env vars + feature flags),
nunca código.

## Modelo: ramas puntero

| Rama | Qué es | Quién despliega desde ella |
|---|---|---|
| `main` | Única rama de desarrollo. Todo PR mergea aquí. | `inventory-xpress-demo` (auto-deploy) |
| `client/<slug>` | **Puntero de release.** No lleva código propio: solo avanza por fast-forward desde `main`. | El proyecto Vercel de ese cliente |

Un cliente nunca recibe un cambio por mergear a `main`: lo recibe cuando alguien **promueve**
su rama puntero. Eso es lo que aísla a los clientes de un deploy roto.

**Las ramas de cliente no aceptan commits propios.** Si un cliente necesita algo distinto,
va detrás de un feature flag en `main`, no en su rama. `scripts/check-client-branches.mjs`
corre en CI y falla si alguna divergió.

## Flujo de release

```
feature branch → PR → merge a main → auto-deploy SOLO a demo → verificar → promover a cada cliente
```

1. **Trabajo normal:** rama desde `main`, PR, `pnpm lint` y `pnpm build` en verde, merge.
2. **El demo se despliega solo** en https://inventory-xpress-demo.vercel.app.
3. **Verificar en demo.** Ojo: el demo corre en `standalone` y Fiori en `integrated`; lo que
   dependa de permisos del JWT de Nómina no queda probado ahí.
4. **Promover a un cliente:**

   ```bash
   node scripts/promote-client.mjs cucina-dei-fiori        # simulación: muestra qué entra
   node scripts/promote-client.mjs cucina-dei-fiori --si   # ejecuta el fast-forward
   ```

   El script empuja el sha de `origin/main` al ref del cliente. Si la rama divergió, GitHub
   rechaza el push por no ser fast-forward: es la red de seguridad, no la saltes con `--force`.
5. **Verificar la producción del cliente** en su dominio.

### Rollback

En Vercel → proyecto del cliente → Deployments → **Instant Rollback** al deployment anterior.
El rollback es de Vercel, no de git: la rama puntero se queda donde está y se corrige en el
siguiente release.

## Feature flags

Declarados por cliente en `clients/registry.json` (campo `features`) y encendidos con env
vars en su proyecto Vercel:

| Feature en el registro | Env var en Vercel | Qué activa |
|---|---|---|
| `cocktails` | `NEXT_PUBLIC_FEATURE_COCKTAILS=true` | Control de licores por nivel de botella |
| `dailyInventory` | `NEXT_PUBLIC_FEATURE_DAILY_INV=true` | Apertura/cierre de jornada de inventario diario |

Ambos están **OFF por defecto** en el código. `scripts/verify-client-flags.mjs` corre al
inicio de `pnpm build` y **falla el build** si los flags del entorno no coinciden con lo
declarado en el registro — en las dos direcciones (falta una declarada, o hay una encendida
sin declarar). Así no se puede repetir el incidente de desplegar un cliente y apagarle
funciones en producción sin darse cuenta.

Cambiar un flag requiere **redeploy** (las `NEXT_PUBLIC_*` se hornean en el bundle).

Para añadir una feature nueva: agregarla a `FEATURE_ENV` en `scripts/lib/features.mjs` y
leerla en `src/lib/config.ts`. El test `scripts/test-client-registry.mjs` falla si un lado
se desincroniza del otro.

## Estado actual

| Cliente | Slug | Rama | Proyecto Vercel | Modo | Features |
|---|---|---|---|---|---|
| Cucina dei Fiori | `cucina-dei-fiori` | `client/cucina-dei-fiori` | `inventory-xpress-fiori` | integrated | cocktails, dailyInventory |
| Demo | `demo` | `main` | `inventory-xpress-demo` | standalone | cocktails, dailyInventory |

## Alta de un cliente nuevo

```bash
TURSO_API_TOKEN=<token> TURSO_ORG=<org> node scripts/provision-client.mjs <slug>
```

El script crea la BD Turso, aplica el schema, corre el seed e imprime el checklist completo
(rama puntero, entrada del registro, proyecto Vercel, env vars, Ignored Build Step, DNS,
secret de backup). Al terminar, verificar con:

```bash
node scripts/check-client-branches.mjs
```

## Verificaciones

| Comando | Qué comprueba |
|---|---|
| `node scripts/check-client-branches.mjs` | Que ninguna rama de cliente divergió de `main`. Corre también en CI. |
| `node scripts/verify-client-flags.mjs` | Que los flags del build coinciden con el registro. Corre en cada `pnpm build`. |
| `node scripts/promote-client.mjs <slug>` | Simula la promoción y lista los commits que entrarían. |
````

- [ ] **Step 2: Actualizar §22 de la documentación técnica**

En `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` §22, reemplazar el primer bullet (el que dice
que el demo auto-despliega y los clientes reciben el build promovido) por:

```markdown
- **Un solo código base (`main`) y una rama puntero por cliente.** `main` despliega
  automáticamente **solo** al demo (`inventory-xpress-demo`). Cada cliente tiene una rama
  `client/<slug>` sin código propio, que solo avanza por fast-forward desde `main`
  (`node scripts/promote-client.mjs <slug> --si`); su proyecto Vercel tiene esa rama como
  Production Branch. Regla de oro: ningún cambio llega a un cliente sin pasar antes por demo
  y sin una promoción explícita. `scripts/check-client-branches.mjs` verifica en CI que
  ninguna rama de cliente haya divergido.
```

- [ ] **Step 3: Añadir la regla no negociable a `CLAUDE.md`**

En la sección "Reglas No Negociables" de `CLAUDE.md`, añadir como punto 9:

```markdown
9. **Las ramas `client/<slug>` son punteros de release: nunca reciben commits propios.**
   Solo avanzan por fast-forward desde `main` (`scripts/promote-client.mjs`). Toda diferencia
   entre clientes va por env var/feature flag declarado en `clients/registry.json`.
```

- [ ] **Step 4: Verificar los enlaces internos de la documentación**

Run:
```bash
node -e "
const fs=require('fs');
const files=['DOCUMENTACION_COMPLETA_DEL_PROYECTO.md','docs/README.md','docs/runbooks/releases-y-multicliente.md','CLAUDE.md'];
let bad=0;
for(const f of files){
  const t=fs.readFileSync(f,'utf8');
  const dir=f.includes('/')?f.split('/').slice(0,-1).join('/'):'.';
  for(const m of t.matchAll(/\]\(([^)#]*\.md)(#[^)]*)?\)/g)){
    const p=require('path').normalize(dir==='.'?m[1]:dir+'/'+m[1]);
    if(!fs.existsSync(p)){console.log('ROTO:',f,'->',m[1]);bad++;}
  }
}
console.log(bad?'HAY ENLACES ROTOS':'Enlaces OK');
"
```
Expected: `Enlaces OK`

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/releases-y-multicliente.md DOCUMENTACION_COMPLETA_DEL_PROYECTO.md CLAUDE.md docs/README.md
git commit -m "docs(multicliente): runbook del modelo de ramas puntero"
```

---

### Task 8: Cutover — crear las ramas y repuntar Vercel

Operación sobre infraestructura viva. **Se hace después de mergear las tareas 1-7 a `main`.**
Cada paso tiene verificación; el rollback está al final.

**Files:** ninguno (operación en GitHub + Vercel).

**Precondición:** las tareas 1-7 están en `main` y el workflow `client-branches.yml` está en verde.

- [ ] **Step 1: Anotar el deployment actual de Fiori para poder revertir**

Run:
```bash
npx vercel ls inventory-xpress-fiori --scope cesicami-5234s-projects | head -5
```
Guardar la URL del deployment Production actual: es el destino del Instant Rollback si algo sale mal.

- [ ] **Step 2: Confirmar que las env vars de Fiori están completas ANTES de repuntar**

Run:
```bash
npx vercel env ls production --scope cesicami-5234s-projects
```
(ejecutado con el proyecto `inventory-xpress-fiori` enlazado)

Expected: aparecen las 11 variables, incluidas `NEXT_PUBLIC_FEATURE_COCKTAILS` y
`NEXT_PUBLIC_FEATURE_DAILY_INV`. **Si falta alguna de las dos, detener aquí**: el build
fallará por la guarda de la Tarea 2 (que es el comportamiento deseado, pero conviene
arreglarlo antes de mover nada).

- [ ] **Step 3: Crear la rama puntero apuntando al `main` actual**

```bash
git fetch origin --prune
git push origin origin/main:refs/heads/client/cucina-dei-fiori
```

Verificar:
```bash
git fetch origin --prune && node scripts/check-client-branches.mjs
```
Expected: `check-client-branches: OK — 1 rama(s) puntero sin divergencias.` y exit 0.

En este punto **todavía no cambió nada en producción**: la rama existe pero ningún proyecto
apunta a ella.

- [ ] **Step 4: Repuntar la Production Branch de Fiori**

En Vercel → proyecto `inventory-xpress-fiori` → **Settings → Git → Production Branch**:
cambiar de `main` a `client/cucina-dei-fiori` y guardar.

El dominio `inventario.cucinadeifiori.com` tiene `gitBranch: null`, así que sigue a la
Production Branch automáticamente: **no hay que tocar DNS ni dominios**.

- [ ] **Step 5: Configurar el Ignored Build Step de Fiori**

En Vercel → proyecto `inventory-xpress-fiori` → **Settings → Git → Ignored Build Step** →
opción "Custom", con el comando:

```bash
if [ "$VERCEL_GIT_COMMIT_REF" = "client/cucina-dei-fiori" ]; then exit 1; else exit 0; fi
```

(En Vercel, exit 1 = construir, exit 0 = saltar.) Sin esto, cada push a `main` seguiría
lanzando un build de preview inútil en el proyecto del cliente.

- [ ] **Step 6: Forzar un deploy desde la rama nueva y verificar**

```bash
node scripts/promote-client.mjs cucina-dei-fiori
```
Expected: `"Cucina dei Fiori" ya está en el último main (<sha>). Nada que promover.` — confirma
que la rama quedó al día.

Para disparar el primer build desde la rama nueva, en Vercel → proyecto → Deployments →
**Redeploy** sobre el último commit de `client/cucina-dei-fiori`.

Verificar cuando termine:
1. Que el build muestra en los logs `verify-client-flags: OK — flags de "cucina-dei-fiori" coinciden con el registro.`
2. Que https://inventario.cucinadeifiori.com carga y **conserva cócteles e inventario diario**.
3. Que el deployment aparece con `target: production` y rama `client/cucina-dei-fiori`.

- [ ] **Step 7: Probar el aislamiento (la prueba de que la migración sirvió)**

Mergear cualquier cambio inocuo a `main` (o usar el siguiente PR real) y comprobar:

```bash
npx vercel ls inventory-xpress-fiori --scope cesicami-5234s-projects | head -5
```
Expected: el deployment Production de Fiori **no cambió**; solo el demo se redesplegó. Este
es el resultado que hoy no se cumple.

- [ ] **Step 8: Rollback (solo si algo falló)**

- Si el sitio del cliente quedó mal: Vercel → `inventory-xpress-fiori` → Deployments →
  **Instant Rollback** al deployment anotado en el Step 1.
- Para volver por completo al modelo anterior: Settings → Git → Production Branch = `main`,
  borrar el Ignored Build Step. La rama `client/cucina-dei-fiori` puede quedarse; no estorba.

- [ ] **Step 9: Registrar el cambio**

Actualizar la tabla "Estado actual" de `docs/runbooks/releases-y-multicliente.md` si algún
dato cambió, y commitear cualquier ajuste.

```bash
git add docs/runbooks/releases-y-multicliente.md
git commit -m "docs(multicliente): estado tras el cutover a ramas puntero"
```

---

## Verificación final

Con todo aplicado, esto debe cumplirse:

| Comprobación | Comando / dónde | Resultado esperado |
|---|---|---|
| Tests de las herramientas | `node scripts/test-client-registry.mjs && node scripts/test-verify-client-flags.mjs && node scripts/test-check-client-branches.mjs && node scripts/test-promote-client.mjs` | 4× `TODO OK` |
| Sin drift de ramas | `node scripts/check-client-branches.mjs` | exit 0 |
| Build local sano | `pnpm build` | verde, con la línea `sin verificación` |
| Lint | `pnpm lint` | sin errores |
| Aislamiento real | merge a `main` | solo el demo se redespliega |
| Flags protegidos | build de cliente sin sus env vars | el build **falla** con `::error::` |
| Backup intacto | Actions → Weekly DB Backup → Run workflow | verde (no lo afecta la migración) |

## Fuera de alcance (candidatos a un plan aparte)

- **Migraciones de BD por cliente.** Nómina tiene `migrate-db.yml` + `prisma/run-migrations.mjs`;
  el inventario no tiene equivalente y usa `prisma migrate diff --from-empty`, que sirve para
  provisionar pero no para evolucionar una base con datos. Con clientes en versiones
  distintas del código esto se vuelve necesario.
- **Protección de rama en GitHub** sobre `main` y `client/*`: el plan free con repo privado
  no la permite (la API devuelve 403). Hoy la guarda es el rechazo de push no-fast-forward
  más el workflow de CI.
