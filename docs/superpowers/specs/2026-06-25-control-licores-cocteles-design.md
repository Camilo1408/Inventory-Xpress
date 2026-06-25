# Control de licores para cócteles por nivel de botella

**Fecha:** 2026-06-25
**Estado:** Aprobado (diseño) — pendiente de plan de implementación

## Problema

Los licores que se usan para preparar cócteles (ginebras, vodkas, rones, vermouth, Campari, Aperol, etc.) no se consumen en días ni semanas exactas: una botella puede durar 2–3 semanas. No se necesita saber para cuántos cócteles alcanza, sino simplemente **tener control de cuándo hay que comprar una botella nueva**, manteniendo los licores en sus envases originales.

El sistema actual controla todo por stock numérico (`currentStock`) con movimientos de entrada/salida. Ese modelo no encaja para estos licores: nadie va a medir mililitros por cóctel. Lo que sí es práctico es estimar el **nivel visual de la botella abierta** y saber si hay **botellas de reserva**.

## Objetivo

Permitir que los licores de la subcategoría **Cócteles** (bajo la categoría raíz **Barra**) se controlen por:
1. **Nivel de la botella abierta** — selector visual tipo semáforo de 5 estados.
2. **Botellas en reserva** — cuántas botellas cerradas hay disponibles.

Y que el sistema **alerte cuándo comprar** según un umbral de nivel configurable por licor, considerando la reserva.

## Alcance

### Dentro de alcance
- Tracking por nivel de botella + reserva para productos de la subcategoría `cocteles`.
- Integración en el flujo de inventario diario existente (apertura/cierre/reapertura) de la categoría raíz Barra.
- Botón "Mantener igual" para días sin movimiento de cócteles.
- Alertas de reposición en la página de Alertas y contador en el dashboard.
- Fase 2: carga de productos reales + pruebas E2E del sistema completo.

### Fuera de alcance (YAGNI)
- Recetas de cócteles o cálculo de cuántos cócteles quedan.
- Medición en mililitros / conversión de unidades.
- Tracking por nivel para otras subcategorías (Licores, Gaseosas, Vinos, Pulpas) o para Cocina — siguen con el sistema numérico actual sin cambios.
- Múltiples botellas abiertas del mismo producto: cada variedad (p. ej. Gordon's, Beefeater, Selva) ya es un producto distinto, con su propia botella abierta y su propia reserva.

## Decisiones de diseño

### Detección de "tipo botella"
- Se basa en el **slug de la subcategoría del producto**: si el producto pertenece a una categoría cuyo slug es `cocteles`, usa tracking de botella.
- Se define como constante en código (p. ej. `BOTTLE_TRACKING_SLUGS = ["cocteles"]` en `src/lib/permissions.ts` o un nuevo `src/lib/bottle.ts`), sin agregar columnas a `Category`.
- La detección es **por producto** (según su subcategoría), no por jornada completa. En la pantalla de inventario diario de Barra conviven bloques numéricos (Licores, Gaseosas, Vinos, Pulpas) y el bloque de botella (Cócteles).

### Niveles de botella (semáforo)
Cinco estados ordenados, con valor numérico para comparar umbrales:

| Estado | Clave | Orden | Color |
|--------|-------|-------|-------|
| Llena | `full` | 5 | emerald |
| 3/4 | `three_quarters` | 4 | emerald |
| Mitad | `half` | 3 | amber |
| 1/4 | `quarter` | 2 | amber/orange |
| Casi vacía | `almost_empty` | 1 | red |

Se definen en un helper compartido (`src/lib/bottle.ts`) con: la lista ordenada, el mapa clave→orden, el mapa clave→etiqueta y el mapa clave→color de badge. El orden numérico es la fuente de verdad para comparar `nivel <= umbral`.

### Umbral de alerta
- Por defecto: `almost_empty`.
- Configurable por licor vía `Product.alertBottleLevel` (puede ser `quarter`, `half`, etc.). `NULL` ⇒ usa el default `almost_empty`.

### Regla de alerta
Un licor de cócteles entra en **alerta de compra** cuando:

```
orden(bottleLevel) <= orden(alertBottleLevel ?? "almost_empty")   Y   (reserveBottles ?? 0) === 0
```

Si hay ≥1 botella en reserva, **no** alerta aunque la abierta esté casi vacía. Productos de cócteles con `bottleLevel === null` (nunca inventariados) no generan alerta.

## Modelo de datos

### `Product` (campos nuevos, todos opcionales)
```prisma
bottleLevel      String?   // "full" | "three_quarters" | "half" | "quarter" | "almost_empty"
reserveBottles   Int?      // botellas cerradas en reserva (0,1,2,...)
alertBottleLevel String?   // umbral de alerta; NULL = "almost_empty"
```
Reflejan el estado **actual** de la botella abierta. Se actualizan al cerrar la jornada (o con "Mantener igual"). Solo aplican a productos de cócteles; en el resto quedan en `NULL`.

### `DailyInventoryItem` (campos nuevos, opcionales)
```prisma
bottleLevel      String?   // snapshot del nivel al cierre de esa jornada
reserveBottles   Int?      // snapshot de reserva al cierre de esa jornada
```
Para ítems de cócteles guardan el snapshot del día; los campos numéricos existentes (`initialCount`, `finalCount`, `unregisteredEntry/Exit`) quedan en `NULL` para esos ítems. Para ítems normales, estos dos campos nuevos quedan en `NULL`.

> Nota: `initialCount` es `Float` (no nulo) en el schema actual. Para no romper la no-nulabilidad, los ítems de cócteles se crearán con `initialCount: 0` y `finalCount: null`; los campos numéricos se ignoran en la UI y en los cálculos de esos ítems. Alternativamente se evalúa hacer `initialCount` opcional — se decidirá en el plan de implementación según el menor impacto.

### Migración
- `npx prisma db push` (dev local) + `npx prisma generate`.
- Campos opcionales ⇒ no requiere backfill de datos existentes.

## Backend

### `loadRootCategory` / carga de productos
Ya carga productos de la raíz + subcategorías ([daily-inventory/route.ts:21](../../../src/app/api/daily-inventory/route.ts)). Se extiende para incluir el `slug` de la subcategoría de cada producto (o se resuelve un set de productIds de cócteles), de modo que tanto la API como la UI sepan qué ítems son de botella.

### POST `/api/daily-inventory` (abrir)
- Acepta en cada item, además de `initialCount`, los campos opcionales `bottleLevel` y `reserveBottles`.
- Para ítems de cócteles:
  - No exige `initialCount` válido para el flujo numérico; se persiste `initialCount: 0`, `bottleLevel`, `reserveBottles`.
  - **No** genera `StockMovement` de `daily_open_adjust` ni toca `currentStock`.
- Para ítems normales: comportamiento actual intacto.
- Validación: `bottleLevel` (si viene) debe ser una clave válida; `reserveBottles` entero ≥ 0.

### PATCH `/api/daily-inventory/[id]` (cerrar)
- Acepta en cada `finalCount` item los campos opcionales `bottleLevel` y `reserveBottles`.
- Para ítems de cócteles:
  - Persiste `bottleLevel` / `reserveBottles` en el `DailyInventoryItem`.
  - Actualiza `Product.bottleLevel` / `Product.reserveBottles` con el estado de cierre.
  - **No** genera `daily_nr_entry/exit/close_adjust` ni modifica `currentStock`.
  - No aplica la validación de "motivo y hora" de entradas no registradas.
- Para ítems normales: comportamiento transaccional actual intacto.
- Reapertura: sin cambios; al reabrir, los snapshots de cócteles se conservan y pueden editarse.

### Permisos
Se reutilizan tal cual los gates por categoría (`canDailyCategory(user, "barra", action)`). No se agregan claves de permiso nuevas: los cócteles viven dentro de la jornada de Barra.

## UI — Inventario diario (`daily-inventory-client.tsx`)

La pantalla agrupa por subcategoría (`byCategory`). Se añade renderizado condicional por bloque:

### Bloque de cócteles — vista "abrir" (CreateView)
Por cada licor:
- **Selector de nivel** tipo semáforo (5 botones/segmentos con color y etiqueta).
- **Contador de reserva** (`− N +`, mínimo 0).
- Valor inicial precargado desde `Product.bottleLevel` / `reserveBottles` (último estado conocido).

### Bloque de cócteles — vista "cerrar" (OpenView)
- Mismo selector de nivel + contador de reserva, precargado con el snapshot del ítem o el estado actual del producto.
- Sin columnas de Inicial/Entradas/Salidas/Esperado/Conteo real para estos ítems.

### Bloque de cócteles — vista "cerrado" (ClosedView)
- Muestra el nivel (badge de color) y la reserva registrados, en modo lectura.

### Botón "Mantener igual"
- Aparece sobre el bloque de Cócteles, tanto al abrir como al cerrar.
- Al pulsarlo: copia a todos los licores de cócteles el último snapshot conocido (de la jornada cerrada anterior, vía `Product.bottleLevel`/`reserveBottles`).
- Tras usarlo, cada licor sigue siendo editable individualmente.
- Pensado para el caso "hoy no salieron cócteles".

## UI — Alertas y dashboard

### Página de Alertas (`alertas/page.tsx`)
- Además de las alertas numéricas actuales (`currentStock <= minStock`), se calcula un segundo conjunto: licores de cócteles en alerta de compra según la regla definida.
- Se consultan productos cuya subcategoría sea `cocteles` con `bottleLevel != null`, y se filtran por la regla `orden(nivel) <= orden(umbral) && reserva === 0`.
- Se muestran con texto adaptado: p. ej. *"Beefeater — Casi vacía, sin reserva → comprar"*.
- `AlertasClient` se extiende para renderizar esta sección (o se unifican como dos grupos visualmente diferenciados).

### Dashboard (`page.tsx`)
- El contador de alertas incluye también los licores de cócteles en alerta de compra.

## Componentes/archivos afectados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Campos nuevos en `Product` y `DailyInventoryItem` |
| `src/lib/bottle.ts` (nuevo) | Constantes de niveles, orden, etiquetas, colores, helpers de detección y de alerta |
| `src/app/api/daily-inventory/route.ts` | Rama de ítems de botella al abrir |
| `src/app/api/daily-inventory/[id]/route.ts` | Rama de ítems de botella al cerrar |
| `src/app/(dashboard)/inventario-diario/page.tsx` | Pasar slug de subcategoría por producto a la UI |
| `src/app/(dashboard)/inventario-diario/daily-inventory-client.tsx` | Render condicional + selector de nivel + reserva + "Mantener igual" |
| `src/components/inventario/bottle-level-selector.tsx` (nuevo) | Componente del selector semáforo reutilizable |
| `src/app/(dashboard)/alertas/page.tsx` | Cálculo de alertas de botella |
| `src/app/(dashboard)/alertas/alertas-client.tsx` | Render de alertas de botella |
| `src/app/(dashboard)/page.tsx` | Contador de alertas incluye cócteles |
| `src/components/products/product-form.tsx` | Campo opcional `alertBottleLevel` para productos de cócteles (configurar umbral) |

## Testing y verificación (Fase 2)

Después de implementar la funcionalidad, se realiza una verificación E2E del sistema completo usando los productos reales del restaurante. Se conduce a través de la app corriendo (driver de navegador), simulando el uso real:

### Carga de datos
Crear las categorías raíz con sus subcategorías y productos a partir de los archivos fuente:

- **Barra** → subcategorías: Licores, Gaseosas, Vinos, **Cócteles**, Pulpas.
- **Cocina** → subcategorías: Postres, Platos de Nevera, Importados, Congelador Blanco, Congelador #1, Congelador #2, Congelados Desayunos.

Productos según `## INVENTARIO DE BARRA.txt` y `## Inventario de Cocina.txt`. Cada producto se crea **uno por uno** (probando el formulario de creación) con un **stock de prueba distinto** por producto. Los productos de Cócteles se crean con un nivel de botella y reserva de prueba.

### Escenarios E2E a ejercitar
1. Creación de categorías y subcategorías (incluida `cocteles`).
2. Creación de productos uno por uno, con stock/nivel de prueba diferenciado.
3. Registro de movimientos: entradas y salidas (productos numéricos).
4. Inventario diario de Barra: abrir, registrar niveles de botella + reserva, conteos numéricos en otros bloques, cerrar.
5. Botón "Mantener igual": cerrar una jornada de cócteles sin cambios.
6. Reabrir un inventario cerrado y editar valores (numéricos y de botella).
7. Verificar alertas: licor con nivel ≤ umbral y sin reserva debe alertar; con reserva no.
8. Verificar dashboard, reportes e historial reflejan los datos.
9. Inventario diario de Cocina (flujo numérico puro) como control de no-regresión.

### Criterio de éxito
- Todos los flujos existentes siguen funcionando (no-regresión en productos numéricos).
- Los licores de cócteles se inventarían por nivel + reserva sin generar movimientos de stock.
- Las alertas de compra aparecen exactamente según la regla, respetando la reserva.
- `pnpm build` y `pnpm lint` pasan sin errores; TypeScript strict sin `any`.

## Riesgos y mitigaciones
- **`initialCount` no nulo**: se mitiga usando `0` para ítems de botella (o haciéndolo opcional en el plan).
- **Cálculos de la UI** (`rows`, `expected`, `discrepancy`) asumen ítems numéricos: deben saltarse para ítems de botella para no producir NaN ni movimientos espurios.
- **Reapertura**: garantizar idempotencia — los snapshots de botella se sobrescriben, no se duplican (no usan `StockMovement`, así que el riesgo es bajo).
- **Detección por slug**: si se renombra la subcategoría y cambia el slug, se rompe la detección. Mitigación: documentar la constante y que el slug `cocteles` es estable (los slugs ya son estables por diseño del contrato con Nómina).
