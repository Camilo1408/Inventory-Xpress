# Runbook: Releases y modelo multi-cliente

Este documento describe las tres operaciones recurrentes del modelo SaaS-por-cliente
de Inventario Xpress: consolidar la rama histórica `deploy-fiori`, el flujo de release
normal (demo → clientes reales), y el alta de un cliente nuevo.

Contexto: la diferencia entre clientes es **configuración**, no código (ver
`src/lib/config.ts`). Los feature flags (`NEXT_PUBLIC_FEATURE_COCKTAILS`,
`NEXT_PUBLIC_FEATURE_DAILY_INV`) están **OFF por defecto** en el código de `main`;
cada proyecto Vercel de cliente los enciende seteando esas env vars en `true`.

---

## Fase 0 — Consolidar `deploy-fiori` → `main`

`deploy-fiori` es la rama histórica desde la que hoy se despliega el proyecto Vercel
de Cucina dei Fiori. Contiene ajustes que nunca se mergearon a `main`. Antes de operar
el modelo multi-cliente hay que consolidarla una sola vez.

### Pasos

1. **Revisar el diff completo entre `main` y `deploy-fiori`:**

   ```bash
   git fetch origin
   git diff main deploy-fiori
   ```

   Revisar commit por commit si el diff es grande:

   ```bash
   git log main..deploy-fiori --oneline
   ```

2. **Decidir qué es "oficial"** para cada cambio encontrado:
   - Si es un fix o mejora general (aplica a todos los clientes) → se debe mergear a `main`.
   - Si es algo específico de Fiori que ya está cubierto por un flag/config (branding,
     `cocktails`, `dailyInventory`) → no se mergea el código viejo, se confirma que el
     equivalente en `main` está detrás del flag correcto.
   - Si es algo específico de Fiori que **no** tiene equivalente en `main` → evaluar si
     debe convertirse en un flag nuevo o en config de `clients/registry.json`, no dejarlo
     hardcodeado.

3. **Mergear a `main`** lo que se decidió oficial (vía PR normal, ver sección siguiente
   para el flujo estándar). No mergear `deploy-fiori` completa de un solo golpe si mezcla
   cambios oficiales con cambios específicos de Fiori.

4. **Repuntar el proyecto Vercel de Fiori a `main`:**
   - En el dashboard de Vercel, proyecto `inventory-cucina-dei-fiori` (scope
     `cesicami-5234s-projects`) → Settings → Git → cambiar la Production Branch de
     `deploy-fiori` a `main`.

> **ADVERTENCIA CRÍTICA — leer antes de repuntar:**
> Antes del **primer deploy de Fiori desde `main`**, hay que setear en el proyecto
> Vercel de Fiori (`inventory-cucina-dei-fiori`) las env vars:
>
> ```
> NEXT_PUBLIC_FEATURE_COCKTAILS=true
> NEXT_PUBLIC_FEATURE_DAILY_INV=true
> ```
>
> Estos flags están **OFF por defecto** en el código de `main` (ver
> `src/lib/config.ts`). Si se repunta la Production Branch a `main` sin haber
> configurado antes estas env vars en el proyecto de Fiori, el próximo deploy
> **pierde el control de cócteles y el inventario diario** para ese cliente en
> producción. Configurar las env vars es un paso manual en el dashboard de Vercel,
> el código no las setea solo.
>
> Orden correcto: 1) setear las env vars en el proyecto Vercel de Fiori, 2) recién
> después cambiar la Production Branch a `main` (o forzar un redeploy).

5. Una vez repuntado y verificado en producción que Fiori conserva cócteles + inventario
   diario, `deploy-fiori` queda congelada como referencia histórica (no se le vuelven a
   hacer commits).

---

## Flujo de release normal

Regla de oro: **ningún bug llega a un cliente en producción sin pasar antes por demo.**

```
feature branch → PR → merge a main → auto-deploy SOLO a demo → verificar en demo → promover a clientes reales
```

### Pasos

1. **Feature branch:** trabajar en una rama a partir de `main` (`git checkout -b feat/...`).

2. **PR:** abrir PR contra `main`. Revisar `pnpm build && pnpm lint` en verde antes de
   pedir merge.

3. **Merge a `main`.**

4. **Auto-deploy solo a demo:** el único proyecto Vercel conectado a auto-deploy de
   `main` es `inventory-xpress-demo` (scope `cesicami-5234s-projects`), disponible en
   `https://inventory-xpress-demo.vercel.app`. Los proyectos de clientes reales
   (por ejemplo `inventory-cucina-dei-fiori`) **no** se despliegan automáticamente en
   cada push a `main` — solo reciben el build cuando se promueve explícitamente
   (paso 6). Esto es intencional: aísla a los clientes reales de un deploy roto.

5. **Verificar en demo:** entrar a `https://inventory-xpress-demo.vercel.app` y
   confirmar que el cambio funciona como se espera, y que las features del demo
   (cócteles + inventario diario) siguen intactas.

6. **Promover el mismo build a clientes reales:** una vez verificado en demo, promover
   exactamente ese build (no un rebuild) a cada proyecto Vercel de cliente activo,
   usando uno de:
   - CLI: `vercel promote <deployment-url-o-id> --scope cesicami-5234s-projects`
     ejecutado apuntando al proyecto del cliente correspondiente.
   - Dashboard: botón "Promote to Production" sobre el deployment ya verificado, desde
     la pestaña Deployments del proyecto del cliente.

   Repetir la promoción para cada cliente activo en `clients/registry.json`.

Si en el paso 5 algo falla, el fix se hace en una nueva rama y se repite el flujo desde
el paso 1 — nunca se promueve un build que no pasó por demo.

---

## Alta de cliente nuevo

1. **Ejecutar el script de aprovisionamiento**, con las credenciales de la organización
   Turso en el entorno:

   ```bash
   TURSO_API_TOKEN=<token> TURSO_ORG=<org> node scripts/provision-client.mjs <slug>
   ```

   El script (`scripts/provision-client.mjs`):
   - Crea la base de datos Turso `inventory-<slug>`.
   - Emite un token de esa base.
   - Aplica el schema de Prisma (`prisma migrate diff` + `scripts/apply-turso-sql.mjs`).
   - Corre el seed inicial (`npx tsx prisma/seed.ts`).
   - Imprime un checklist de pasos manuales restantes.

2. **Seguir el checklist impreso por el script**, que incluye:
   1. Crear el proyecto Vercel enlazado al repo (rama de producción = `main`).
   2. Setear en ese proyecto las env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
      (el token emitido por el script), `NEXTAUTH_SECRET` (uno único para el cliente),
      `AUTH_MODE=standalone`, y los feature flags/branding que correspondan al cliente
      (recordar que `NEXT_PUBLIC_FEATURE_COCKTAILS` y `NEXT_PUBLIC_FEATURE_DAILY_INV`
      son OFF por defecto — encenderlos explícitamente si el cliente los necesita).
   3. Configurar el subdominio y el CNAME en DNS.
   4. Agregar la entrada del cliente en `clients/registry.json`.
   5. Guardar el token de la base como secret de GitHub.

3. **Agregar la entrada en `clients/registry.json`** con los campos: `slug`,
   `displayName`, `domain`, `vercelProject`, `tursoDatabase`, `features`, `active`.

4. **Guardar el token del cliente como secret de GitHub** con la convención de nombre:

   ```
   TURSO_TOKEN_<SLUG_EN_MAYUSCULAS_CON_GUION_BAJO>
   ```

   Ejemplo: slug `cucina-dei-fiori` → secret `TURSO_TOKEN_CUCINA_DEI_FIORI`.

5. Una vez creado el proyecto Vercel del cliente, este **no** recibe auto-deploy en cada
   push a `main` (ver "Flujo de release normal"): su primer y siguientes deploys llegan
   por promoción explícita desde un build ya verificado en demo.
