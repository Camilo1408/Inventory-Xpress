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
