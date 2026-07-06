# Diseño — Modelo multi-cliente + flujo de releases

**Fecha:** 2026-07-06
**Estado:** Aprobado (pendiente de plan de implementación)
**Autor:** Camilo + Claude

## Objetivo

Servir el sistema de inventario a múltiples restaurantes (SaaS vendido por
instancia) desde **un solo código base centralizado en `main`**, donde la
diferencia entre clientes es **configuración** (env vars + registro), nunca
código fuente. Cada cliente tiene su propia base de datos Turso, su propio
proyecto Vercel y su propio dominio: aislamiento físico, no multitenancy.

### Principio rector

> Si dos clientes necesitaran código fuente distinto, el diseño está mal. Toda
> diferencia entre clientes es un valor de configuración, no una rama de git.

### No-objetivos

- **No** es multitenancy (una BD compartida con `tenant_id`). Cada cliente =
  una BD Turso independiente.
- **No** se crean ramas por cliente. `main` es la única fuente de lo oficial.
- **No** se construyen feature flags para funciones que todos los clientes
  tendrán siempre (reportes, auditoría, productos, movimientos permanecen
  siempre activos).

## Alcance de feature flags (decidido)

Solo dos funciones son conmutables por cliente hoy, porque son propias de
Cucina dei Fiori y un cliente genérico podría no tenerlas:

| Flag | Función | Default |
|------|---------|---------|
| `cocktails` | Control de licores por nivel de botella | **OFF** |
| `dailyInventory` | Flujo de apertura/cierre de jornada | **OFF** |

Los flags vienen **apagados por defecto**: un cliente nuevo no ve estas
funciones a menos que se activen explícitamente. Cucina dei Fiori las enciende
en su configuración.

`userManagement` (standalone vs integrated) ya existe como `AUTH_MODE` y se
absorbe en el módulo central, pero no es un flag nuevo.

## Arquitectura

### 1. Módulo de configuración central — `src/lib/config.ts`

Un único módulo lee `process.env` una vez y expone configuración tipada.
Reemplaza los ~12 accesos crudos a `process.env.AUTH_MODE` dispersos por el
código con un objeto tipado.

```typescript
export const config = {
  authMode: process.env.AUTH_MODE === "standalone" ? "standalone" : "integrated",
  brand: {
    name:    process.env.NEXT_PUBLIC_BRAND_NAME ?? "Inventario",
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO ?? null,
  },
  features: {
    userManagement: process.env.AUTH_MODE === "standalone",
    cocktails:      process.env.NEXT_PUBLIC_FEATURE_COCKTAILS === "true", // OFF por defecto
    dailyInventory: process.env.NEXT_PUBLIC_FEATURE_DAILY_INV === "true", // OFF por defecto
  },
} as const;
```

- `cocktails` y `dailyInventory` usan prefijo `NEXT_PUBLIC_` porque afectan la
  UI (sidebar, formularios) además del servidor.
- Todo tiene un default sensato: un cliente solo setea las env vars que quiere
  cambiar.

### 2. Aplicación de los flags — 3 capas

Un flag apagado no debe dejar rastro accesible. Cada función se corta en tres
niveles para que apagarla no solo esconda el botón sino que cierre la API
(coherente con la regla no negociable de verificar permisos en cada API route).

| Capa | `cocktails` OFF | `dailyInventory` OFF |
|------|-----------------|----------------------|
| Navegación (sidebar / formularios) | Oculta controles de nivel de botella | Oculta el link "Inventario diario" |
| Ruta (server component) | — | `/inventario-diario` → `redirect("/")` |
| API (route handler) | Ignora campos `bottleLevel`/`reserveBottles` en products y movements | `/api/daily-inventory*` → 403 |

### 3. Registro de clientes — `clients/registry.json`

Fuente de verdad **versionada y sin secretos**. Solo el índice de quién existe;
las credenciales viven en secrets, referenciadas por convención de nombre.

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
    }
  ]
}
```

- **Sin credenciales.** El token de Turso de cada cliente vive como secret con
  convención `TURSO_TOKEN_<SLUG_EN_MAYUSCULAS>` (ej.
  `TURSO_TOKEN_CUCINA_DEI_FIORI`). El registro solo declara que el cliente
  existe y cómo se llama su secret.
- `features` es informativo/documental (la activación real es por env var en el
  proyecto Vercel del cliente).
- `active` permite excluir un cliente de operaciones (ej. backups) sin borrarlo.

### 4. Aprovisionamiento de cliente — `scripts/provision-client.mjs`

Script semi-automatizado que dado un `slug`:

1. Crea la BD Turso en la organización dedicada.
2. Aplica el schema con `scripts/apply-turso-sql.mjs` + corre el seed inicial.
3. Imprime el checklist manual restante:
   - Crear proyecto Vercel enlazado al repo (rama de producción = `main`).
   - Setear env vars del cliente (branding, flags, `TURSO_*`, `NEXTAUTH_SECRET`
     único).
   - Configurar CNAME del subdominio.
   - Agregar la entrada correspondiente en `clients/registry.json`.

La parte de base de datos queda en un comando; los pasos de Vercel/DNS quedan
como checklist guiado (no automatizable sin tokens adicionales de plataforma).

### 5. Flujo de releases — demo primero, luego promover

```
feature branch → PR → merge a main   (main = producto oficial)
        │
        ▼ auto-deploy
   Vercel: proyecto DEMO ─────── se verifica aquí
        │
        ▼ promoción manual (aprobación)
   Vercel: clientes reales ───── mismo build ya verificado
```

- El proyecto **demo** tiene auto-deploy activado sobre `main`.
- Los proyectos de **clientes reales** tienen auto-deploy desactivado; se
  despliegan promoviendo el build ya verificado (`vercel promote` o el botón de
  promoción de Vercel).
- Garantía: un bug nunca llega directo a un restaurante en producción sin pasar
  antes por la demo.

## Fases de implementación

### Fase 0 — Consolidar `main` como fuente oficial (prerequisito)

Hoy la app se despliega desde `deploy-fiori`. Antes de adoptar este modelo:

1. Reconciliar `deploy-fiori` → `main` (mergear lo que sea oficial).
2. Repuntar los proyectos Vercel a `main`.

Se ejecuta con cuidado en su propia sesión por el riesgo de divergencia entre
ramas.

### Fase 1 — Módulo de config + feature flags

1. Crear `src/lib/config.ts`.
2. Reemplazar accesos crudos a `process.env.AUTH_MODE` por `config`.
3. Implementar el corte de `cocktails` y `dailyInventory` en las 3 capas.
4. Verificar: con ambos flags OFF, el cliente demo genérico no ve ni accede a
   esas funciones; con ON, funcionan como hoy.

### Fase 2 — Registro y aprovisionamiento

1. Crear `clients/registry.json` con la entrada de Cucina dei Fiori.
2. Crear `scripts/provision-client.mjs`.
3. Documentar la convención de secrets `TURSO_TOKEN_<SLUG>`.

### Fase 3 — Flujo de releases

1. Configurar el proyecto demo con auto-deploy sobre `main`.
2. Desactivar auto-deploy en proyectos de clientes reales; documentar la
   promoción manual.

## Conexión con el sistema de backups (spec siguiente)

El workflow de backup leerá `clients/registry.json`, armará una *matrix* con los
clientes `active`, y por cada uno tomará su secret `TURSO_TOKEN_<SLUG>` para
respaldar a `blob://backups/<slug>/<fecha>.sql`. El registro de clientes es el
pegamento entre este modelo y el sistema de backups.

## Riesgos y consideraciones

- **Divergencia `deploy-fiori` ↔ `main`:** la Fase 0 debe reconciliarse con
  cuidado; es el punto de mayor riesgo. Revisar el diff completo antes de
  mergear.
- **Flags `NEXT_PUBLIC_`:** cambiar un flag público requiere **rebuild** del
  proyecto (no es runtime puro). Aceptable: activar/desactivar una función por
  cliente es una operación poco frecuente.
- **Secret único por cliente:** cada cliente debe tener su propio
  `NEXTAUTH_SECRET`; reutilizarlo entre clientes rompería el aislamiento de
  sesiones.
