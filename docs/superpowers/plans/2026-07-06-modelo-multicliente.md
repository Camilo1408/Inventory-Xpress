# Modelo multi-cliente — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la configuración por cliente en un módulo tipado y habilitar feature flags (cócteles, inventario diario) apagables por cliente, sin ramas por cliente.

**Architecture:** Un módulo `src/lib/config.ts` lee `process.env` una vez y expone config tipada. El flag de cócteles se aplica en el único chokepoint `isBottleTrackedSlug` (bottle.ts). El flag de inventario diario se aplica en 3 capas: sidebar (prop), ruta (redirect) y API (403). Un registro versionado `clients/registry.json` lista los clientes sin secretos.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 + Turso, Vercel.

## Global Constraints

- **TypeScript strict sin `any`.** (Regla no negociable del proyecto.)
- **No hay framework de tests unitarios.** Verificación por `pnpm build` (typecheck + compile), `pnpm lint`, y verificación manual con las herramientas de preview. Cada tarea de código termina con build+lint verdes.
- **Flags de cócteles e inventario diario: OFF por defecto.** Solo se activan con env var explícita.
- **`NEXT_PUBLIC_` para flags de UI:** cambiarlos requiere rebuild (no runtime puro).
- **La demo (proyecto Vercel `inventory-xpress-demo`, rama `main`) y Fiori (rama `deploy-fiori`) DEBEN conservar cócteles e inventario diario activos.** Para la demo se logra seteando env vars ON (Tarea 5). Fiori vive en `deploy-fiori` y **no se toca** en este plan; conserva su comportamiento actual.
- **No mergear estos cambios a `deploy-fiori`.**

---

### Task 1: Módulo de configuración central

**Files:**
- Create: `src/lib/config.ts`

**Interfaces:**
- Produces: `config` — objeto readonly con:
  - `config.authMode: "standalone" | "integrated"`
  - `config.brand: { name: string; logoUrl: string | null }`
  - `config.features: { userManagement: boolean; cocktails: boolean; dailyInventory: boolean }`

- [ ] **Step 1: Crear el módulo**

```typescript
// src/lib/config.ts
// Configuración por instancia/cliente, centralizada. Lee process.env una sola vez.
// Regla del modelo multi-cliente: la diferencia entre clientes es configuración,
// no código. Los flags de features vienen OFF por defecto (propios de Cucina dei
// Fiori hoy); un cliente los enciende con su env var correspondiente.

const authMode = process.env.AUTH_MODE === "standalone" ? "standalone" : "integrated";

export const config = {
  authMode,
  brand: {
    name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Inventario",
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO ?? null,
  },
  features: {
    // Standalone habilita gestión de usuarios/roles/perfil (ya existía como AUTH_MODE).
    userManagement: authMode === "standalone",
    // OFF por defecto: control de licores por nivel de botella.
    cocktails: process.env.NEXT_PUBLIC_FEATURE_COCKTAILS === "true",
    // OFF por defecto: flujo de apertura/cierre de jornada.
    dailyInventory: process.env.NEXT_PUBLIC_FEATURE_DAILY_INV === "true",
  },
} as const;
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm build`
Expected: compila sin errores (el módulo aún no se usa).

- [ ] **Step 3: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: módulo de configuración central por cliente (config.ts)"
```

---

### Task 2: Migrar lecturas de AUTH_MODE a config

Reemplaza los 12 accesos crudos a `process.env.AUTH_MODE` por `config`. Mantiene comportamiento idéntico (refactor puro).

**Files:**
- Modify: `src/lib/auth.ts:8`
- Modify: `src/lib/auth.config.ts:8`
- Modify: `src/proxy.ts:7`
- Modify: `src/app/(dashboard)/layout.tsx:21`
- Modify: `src/app/(dashboard)/admin/roles/page.tsx:18`
- Modify: `src/app/(dashboard)/admin/usuarios/page.tsx:18`
- Modify: `src/app/(dashboard)/perfil/page.tsx:9`
- Modify: `src/app/api/admin/roles/route.ts:9`
- Modify: `src/app/api/admin/roles/[id]/route.ts:8`
- Modify: `src/app/api/admin/users/route.ts:9`
- Modify: `src/app/api/admin/users/[id]/route.ts:9`
- Modify: `src/app/api/profile/route.ts:7`

**Interfaces:**
- Consumes: `config.authMode`, `config.features.userManagement` (de Task 1).

- [ ] **Step 1: Reemplazar en cada archivo**

Patrón general:
- `process.env.AUTH_MODE === "standalone"` → `config.features.userManagement` (en guards de gestión de usuarios/roles/perfil) o `config.authMode === "standalone"` (en auth.ts/auth.config.ts/proxy.ts/layout.tsx donde el sentido es literal el modo).
- `process.env.AUTH_MODE !== "standalone"` → `config.authMode !== "standalone"`.

Agregar en cada archivo el import: `import { config } from "@/lib/config";` (ruta relativa `./config` dentro de `src/lib/`).

Ejemplos exactos:

`src/lib/auth.ts:8`
```typescript
// antes: const isStandalone = process.env.AUTH_MODE === "standalone";
import { config } from "./config";
const isStandalone = config.authMode === "standalone";
```

`src/app/api/profile/route.ts:7`
```typescript
// antes: return process.env.AUTH_MODE === "standalone";
import { config } from "@/lib/config";
// ...
return config.features.userManagement;
```

`src/app/(dashboard)/perfil/page.tsx:9`
```typescript
// antes: if (process.env.AUTH_MODE !== "standalone") redirect("/");
import { config } from "@/lib/config";
// ...
if (!config.features.userManagement) redirect("/");
```

Aplicar el mismo criterio a los 12 sitios listados.

- [ ] **Step 2: Confirmar que no quedan lecturas crudas**

Run: `grep -rn "process.env.AUTH_MODE" src/`
Expected: sin resultados (exit 1 / vacío).

- [ ] **Step 3: Verificar build + lint**

Run: `pnpm build && pnpm lint`
Expected: ambos verdes.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor: centraliza lecturas de AUTH_MODE en config"
```

---

### Task 3: Gate de cócteles en el chokepoint isBottleTrackedSlug

`isBottleTrackedSlug` es el único punto del que derivan los 12 consumidores de la función de botellas. Gatearlo apaga toda la UI y lógica de cócteles cuando el flag está OFF.

**Files:**
- Modify: `src/lib/bottle.ts:55-58`

**Interfaces:**
- Consumes: `config.features.cocktails` (de Task 1).
- Produces: `isBottleTrackedSlug(slug)` ahora retorna `false` si el flag está OFF, sin cambiar su firma.

- [ ] **Step 1: Añadir el gate**

En `src/lib/bottle.ts`, agregar el import al inicio (tras el comentario de cabecera):
```typescript
import { config } from "./config";
```

Reemplazar la función:
```typescript
/** ¿La subcategoría con este slug se controla por nivel de botella?
 *  Si el feature flag de cócteles está apagado para esta instancia, siempre false
 *  (oculta toda la UI y omite la lógica de botella en un solo punto). */
export function isBottleTrackedSlug(slug: string | null | undefined): boolean {
  if (!config.features.cocktails) return false;
  return !!slug && BOTTLE_TRACKING_SLUGS.includes(slug);
}
```

- [ ] **Step 2: Verificar build + lint**

Run: `pnpm build && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Verificación manual del gate (OFF)**

Con el flag apagado localmente (sin `NEXT_PUBLIC_FEATURE_COCKTAILS`), correr `pnpm dev` y confirmar en el formulario de producto de una subcategoría "cocteles" que **no aparecen** los controles de nivel de botella. Con `NEXT_PUBLIC_FEATURE_COCKTAILS=true` en `.env.local`, reaparecen.

Nota: `.env.local` local ya tiene los flags para desarrollo (ver Task 5 para la convención). Documentar en `.env.example` (Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/lib/bottle.ts
git commit -m "feat: feature flag de cócteles vía isBottleTrackedSlug"
```

---

### Task 4: Gate de inventario diario (3 capas)

**Files:**
- Modify: `src/components/layout/sidebar.tsx:30,52` (nueva prop + gate del nav item)
- Modify: `src/components/layout/dashboard-shell.tsx` (pasar prop)
- Modify: `src/app/(dashboard)/layout.tsx` (pasar `config.features.dailyInventory`)
- Modify: `src/app/(dashboard)/inventario-diario/page.tsx` (redirect si OFF)
- Modify: `src/app/api/daily-inventory/route.ts` (403 si OFF)
- Modify: `src/app/api/daily-inventory/[id]/route.ts` (403 si OFF)

**Interfaces:**
- Consumes: `config.features.dailyInventory` (de Task 1).

- [ ] **Step 1: Sidebar — nueva prop y gate del link**

En `src/components/layout/sidebar.tsx`, agregar a `SidebarProps`:
```typescript
  featureDailyInventory?: boolean;
```
Recibirla en el destructuring de `Sidebar({ ... })` y cambiar el nav item (línea ~52) a esta forma exacta:
```typescript
    { href: "/inventario-diario",icon: ClipboardList,   label: "Inventario Diario", show: !!canDoStockCount && !!featureDailyInventory },
```

- [ ] **Step 2: DashboardShell — propagar la prop**

En `src/components/layout/dashboard-shell.tsx`, agregar a `DashboardShellProps`:
```typescript
  featureDailyInventory: boolean;
```
Recibirla en el destructuring y pasarla al `<Sidebar ... featureDailyInventory={featureDailyInventory} />`.

- [ ] **Step 3: Layout — inyectar el flag**

En `src/app/(dashboard)/layout.tsx`, importar config y pasar la prop:
```typescript
import { config } from "@/lib/config";
// ...
    <DashboardShell
      // ...props existentes...
      featureDailyInventory={config.features.dailyInventory}
    >
```

- [ ] **Step 4: Ruta — redirect si OFF**

En `src/app/(dashboard)/inventario-diario/page.tsx`, tras `if (!session) redirect("/login");`:
```typescript
import { config } from "@/lib/config";
// ...
  if (!config.features.dailyInventory) redirect("/");
```

- [ ] **Step 5: API — 403 si OFF (ambos handlers de cada archivo)**

En `src/app/api/daily-inventory/route.ts` y `src/app/api/daily-inventory/[id]/route.ts`, agregar el import `import { config } from "@/lib/config";` y, al inicio de cada handler exportado (GET/POST/PATCH/DELETE presentes), justo después de obtener `session`:
```typescript
  if (!config.features.dailyInventory) {
    return NextResponse.json({ error: "Función no disponible" }, { status: 403 });
  }
```

- [ ] **Step 6: Verificar build + lint**

Run: `pnpm build && pnpm lint`
Expected: verdes.

- [ ] **Step 7: Verificación manual**

Con flag OFF: el link "Inventario Diario" no aparece en el sidebar; navegar a `/inventario-diario` redirige a `/`; `GET /api/daily-inventory` responde 403. Con `NEXT_PUBLIC_FEATURE_DAILY_INV=true`: todo funciona como hoy.

- [ ] **Step 8: Commit**

```bash
git add src/
git commit -m "feat: feature flag de inventario diario en sidebar, ruta y API"
```

---

### Task 5: Conservar features activas en la demo (operacional)

La demo (`inventory-xpress-demo`, rama `main`) perdería cócteles e inventario diario al desplegar el código con defaults OFF. Setear las env vars ON **antes o junto** al deploy.

**Files:** ninguno (configuración en Vercel).

- [ ] **Step 1: Setear env vars en el proyecto demo**

```bash
printf "true" | vercel env add NEXT_PUBLIC_FEATURE_COCKTAILS production
printf "true" | vercel env add NEXT_PUBLIC_FEATURE_DAILY_INV production
```
(Proyecto ya enlazado a `inventory-xpress-demo`; scope `cesicami-5234s-projects`.)

- [ ] **Step 2: Push a main → auto-deploy**

```bash
git push origin main
```

- [ ] **Step 3: Verificar la demo desplegada**

Tras el deploy, iniciar sesión en `https://inventory-xpress-demo.vercel.app` como `superadmin/superadmin123` y confirmar que el link "Inventario Diario" aparece y que los controles de botella siguen presentes en productos de cócteles. Confirmar `GET /api/daily-inventory` responde 200 (no 403) con sesión válida.

---

### Task 6: Registro de clientes + documentar env vars

**Files:**
- Create: `clients/registry.json`
- Modify: `.env.example` (documentar los nuevos flags y branding)

**Interfaces:**
- Produces: `clients/registry.json` con array `clients` de `{ slug, displayName, domain, vercelProject, tursoDatabase, features, active }`. Sin secretos. Lo consumirá el spec de backups.

- [ ] **Step 1: Crear el registro**

```json
{
  "clients": [
    {
      "slug": "cucina-dei-fiori",
      "displayName": "Cucina dei Fiori",
      "domain": "inventario.cucinadeifiori.com",
      "vercelProject": "inventory-cucina-dei-fiori",
      "tursoDatabase": "inventory-fiori",
      "features": ["cocktails", "dailyInventory"],
      "active": true
    },
    {
      "slug": "demo",
      "displayName": "Demo",
      "domain": "inventory-xpress-demo.vercel.app",
      "vercelProject": "inventory-xpress-demo",
      "tursoDatabase": "inventory-xpress-demo-camilo1408",
      "features": ["cocktails", "dailyInventory"],
      "active": true
    }
  ]
}
```

- [ ] **Step 2: Documentar flags y convención de secrets en .env.example**

Agregar al final de `.env.example`:
```bash
# Branding por cliente
# NEXT_PUBLIC_BRAND_NAME=Cucina dei Fiori
# NEXT_PUBLIC_BRAND_LOGO=https://.../logo.png

# Feature flags por cliente (OFF por defecto). Poner "true" para activar.
# NEXT_PUBLIC_FEATURE_COCKTAILS=true
# NEXT_PUBLIC_FEATURE_DAILY_INV=true

# Convención de secrets de backup: el token Turso de cada cliente se guarda como
# secret de GitHub Actions con nombre TURSO_TOKEN_<SLUG_EN_MAYUSCULAS_CON_GUION_BAJO>
# Ej. cliente slug "cucina-dei-fiori" -> secret TURSO_TOKEN_CUCINA_DEI_FIORI
```

- [ ] **Step 3: Commit**

```bash
git add clients/registry.json .env.example
git commit -m "feat: registro de clientes versionado + documenta flags y secrets"
```

---

### Task 7: Script de aprovisionamiento de cliente

Script que crea la BD Turso de un cliente, aplica schema + seed, e imprime el checklist manual restante. La parte de Turso requiere un API token de plataforma (pendiente de que el usuario lo genere); el script debe fallar con un mensaje claro si no está.

**Files:**
- Create: `scripts/provision-client.mjs`

**Interfaces:**
- Consumes: `scripts/apply-turso-sql.mjs` (ya existe), `prisma/seed.ts` (ya existe).

- [ ] **Step 1: Crear el script**

```javascript
// scripts/provision-client.mjs
// Aprovisiona la BD Turso de un cliente nuevo y guía el resto del alta.
// Uso: TURSO_API_TOKEN=... TURSO_ORG=<org> node scripts/provision-client.mjs <slug>
// Requiere el CLI de turso instalado (o la API de plataforma). Este script usa
// la API HTTP de Turso para crear la base y luego aplica schema + seed.

import { execSync } from "node:child_process";

const slug = process.argv[2];
const apiToken = process.env.TURSO_API_TOKEN;
const org = process.env.TURSO_ORG;

if (!slug) {
  console.error("Falta el slug del cliente. Uso: node scripts/provision-client.mjs <slug>");
  process.exit(1);
}
if (!apiToken || !org) {
  console.error("Faltan TURSO_API_TOKEN y/o TURSO_ORG en el entorno.");
  console.error("Genera el API token en app.turso.tech -> Account -> API Tokens.");
  process.exit(1);
}

const dbName = `inventory-${slug}`;

async function api(path, method = "GET", body) {
  const res = await fetch(`https://api.turso.tech/v1/organizations/${org}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Turso API ${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log(`Creando BD Turso "${dbName}" en org "${org}"...`);
  await api("/databases", "POST", { name: dbName, group: "default" });

  const { database } = await api(`/databases/${dbName}`);
  const url = `libsql://${database.Hostname}`;

  console.log("Emitiendo token de la BD...");
  const tokenRes = await api(`/databases/${dbName}/auth/tokens`, "POST", {});
  const dbToken = tokenRes.jwt;

  console.log("Generando SQL de schema...");
  execSync("npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o .provision.sql", { stdio: "inherit" });

  console.log("Aplicando schema...");
  execSync("node scripts/apply-turso-sql.mjs .provision.sql", {
    stdio: "inherit",
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: dbToken },
  });

  console.log("Corriendo seed inicial...");
  execSync("npx tsx prisma/seed.ts", {
    stdio: "inherit",
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: dbToken },
  });

  execSync("rm -f .provision.sql");

  console.log("\n─── LISTO. Pasos manuales restantes ───");
  console.log(`1. Crear proyecto Vercel enlazado al repo (rama producción = main).`);
  console.log(`2. Setear env vars en ese proyecto:`);
  console.log(`     TURSO_DATABASE_URL=${url}`);
  console.log(`     TURSO_AUTH_TOKEN=<el token emitido arriba>`);
  console.log(`     NEXTAUTH_SECRET=<genera uno único>`);
  console.log(`     AUTH_MODE=standalone`);
  console.log(`     (flags/branding según el cliente)`);
  console.log(`3. Configurar el subdominio + CNAME en DNS.`);
  console.log(`4. Agregar la entrada en clients/registry.json (slug: ${slug}).`);
  console.log(`5. Guardar el token como secret GitHub: TURSO_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Verificar sintaxis (sin ejecutar la creación real)**

Run: `node --check scripts/provision-client.mjs`
Expected: sin errores de sintaxis. (La ejecución real contra Turso queda pendiente del `TURSO_API_TOKEN` que generará el usuario.)

**Nota:** los campos de la API de Turso usados aquí (`database.Hostname`, `/auth/tokens` → `jwt`) son la mejor aproximación al contrato de la API de plataforma; verificarlos contra la doc vigente de Turso al ejecutar por primera vez y ajustar si difieren.

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-client.mjs
git commit -m "feat: script de aprovisionamiento de cliente Turso"
```

---

### Task 8: Runbook de releases y consolidación (documentación)

**Files:**
- Create: `docs/runbooks/releases-y-multicliente.md`

- [ ] **Step 1: Escribir el runbook**

Contenido (secciones):
1. **Fase 0 — Consolidar `deploy-fiori` → `main`:** pasos para revisar el diff completo (`git diff main deploy-fiori`), decidir qué es oficial, mergear a `main`, y repuntar el proyecto Vercel de Fiori a `main`. Advertencia: al hacerlo, setear en el proyecto Vercel de Fiori `NEXT_PUBLIC_FEATURE_COCKTAILS=true` y `NEXT_PUBLIC_FEATURE_DAILY_INV=true` ANTES del primer deploy desde `main`, para no perder features.
2. **Flujo de release normal:** feature branch → PR → merge a `main` → auto-deploy solo a demo → verificar → promover a clientes reales (`vercel promote` o botón de promoción).
3. **Alta de cliente nuevo:** correr `scripts/provision-client.mjs <slug>` y seguir el checklist que imprime.

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/releases-y-multicliente.md
git commit -m "docs: runbook de releases, consolidación y alta de clientes"
```

---

## Notas de verificación final

Tras todas las tareas:
- `pnpm build && pnpm lint` verdes.
- `grep -rn "process.env.AUTH_MODE" src/` vacío.
- Demo desplegada conserva cócteles + inventario diario (Task 5 Step 3).
- `deploy-fiori` intacto (no recibió commits).
