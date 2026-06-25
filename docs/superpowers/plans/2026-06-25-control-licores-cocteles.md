# Control de licores para cócteles por nivel de botella — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir controlar los licores de la subcategoría Cócteles por nivel de botella (semáforo de 5 estados) + botellas en reserva, integrado en el inventario diario de Barra, con alertas de reposición configurables por licor.

**Architecture:** Se añaden campos opcionales a `Product` y `DailyInventoryItem`. La detección "tipo botella" se hace por el slug de la subcategoría del producto (`cocteles`) mediante un helper puro compartido (`src/lib/bottle.ts`). El inventario diario de Barra renderiza bloques numéricos (sin cambios) y un bloque de botella (Cócteles) que guarda snapshot sin tocar `currentStock` ni generar `StockMovement`. Las alertas se calculan con la regla `orden(nivel) <= orden(umbral) && reserva === 0`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict (sin `any`), Prisma 7 + SQLite/Turso, NextAuth v5, Tailwind v4 + shadcn/ui, lucide-react, sonner.

## Global Constraints

- TypeScript strict, **sin `any`** (regla no negociable del proyecto).
- `currentStock` solo se modifica dentro de una transacción Prisma que también crea el `StockMovement`. **Los ítems de botella no tocan `currentStock` ni crean `StockMovement`.**
- Verificar permisos explícitamente al inicio de cada API route (se reutilizan los gates por categoría existentes; no se añaden claves nuevas).
- Prisma 7: no hay `url` en `schema.prisma`; tras cambiar el schema correr `npx prisma db push` + `npx prisma generate`.
- Next.js 16: middleware en `src/proxy.ts` (no se toca en este plan).
- Slug de detección de botella: constante `BOTTLE_TRACKING_SLUGS = ["cocteles"]`.
- Niveles ordenados: `full`(5) > `three_quarters`(4) > `half`(3) > `quarter`(2) > `almost_empty`(1). Umbral por defecto: `almost_empty`.
- Verificación: no existe framework de tests unitarios. Para lógica pura se usa un script `tsx`. Para API/UI: `pnpm lint` + `pnpm build` + chequeos E2E (Fase 2). Commits con rutas de archivo **explícitas** (nunca `git add -A`), porque el árbol de trabajo tiene cambios previos no relacionados.

## Pre-flight

- [ ] **Crear rama de trabajo** (el árbol está en `main` con cambios previos sin commitear; no tocar la historia de `main`).

```bash
git checkout -b feat/licores-cocteles-nivel-botella
```

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/bottle.ts` (nuevo) | Constantes de niveles, orden, etiquetas, colores; detección por slug; regla de alerta. Lógica pura sin dependencias de React/Prisma. |
| `scripts/bottle.test.ts` (nuevo, temporal) | Test ejecutable con `tsx` de la lógica pura de `bottle.ts`. |
| `prisma/schema.prisma` (mod) | Campos nuevos en `Product` y `DailyInventoryItem`. |
| `src/components/inventario/bottle-level-selector.tsx` (nuevo) | Selector semáforo + contador de reserva (client component reutilizable). |
| `src/app/api/daily-inventory/route.ts` (mod) | Rama de ítems de botella al abrir. |
| `src/app/api/daily-inventory/[id]/route.ts` (mod) | Rama de ítems de botella al cerrar. |
| `src/app/(dashboard)/inventario-diario/page.tsx` (mod) | Pasar slug de subcategoría por producto a la UI. |
| `src/app/(dashboard)/inventario-diario/daily-inventory-client.tsx` (mod) | Render condicional por bloque + "Mantener igual". |
| `src/app/(dashboard)/alertas/page.tsx` (mod) | Cálculo de alertas de botella. |
| `src/app/(dashboard)/alertas/alertas-client.tsx` (mod) | Render de alertas de botella. |
| `src/app/(dashboard)/page.tsx` (mod) | Contador de alertas incluye cócteles. |
| `src/components/products/product-form.tsx` (mod) | Campo `alertBottleLevel` para productos de cócteles. |
| `src/app/api/products/route.ts` (mod) | Aceptar `alertBottleLevel` al crear. |
| `src/app/api/products/[id]/route.ts` (mod) | Aceptar `alertBottleLevel` al editar. |
| `src/app/(dashboard)/productos/[id]/editar/page.tsx` (mod) | Pasar `alertBottleLevel` + slug de subcategoría a `initialData`. |
| `src/app/(dashboard)/productos/nuevo/page.tsx` (mod) | (Sin cambios de datos; el form detecta por categoría seleccionada.) |

---

## Task 1: Helper de niveles de botella (`src/lib/bottle.ts`)

**Files:**
- Create: `src/lib/bottle.ts`
- Test: `scripts/bottle.test.ts` (temporal, se elimina al final del task)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BottleLevel = "full" | "three_quarters" | "half" | "quarter" | "almost_empty"`
  - `const BOTTLE_TRACKING_SLUGS: readonly string[]` (= `["cocteles"]`)
  - `const BOTTLE_LEVELS: readonly { key: BottleLevel; label: string; order: number; badgeClass: string; dotClass: string }[]` (ordenado de lleno a casi vacío)
  - `function isBottleLevel(v: unknown): v is BottleLevel`
  - `function bottleLevelOrder(level: BottleLevel): number`
  - `function bottleLevelMeta(level: BottleLevel): { key: BottleLevel; label: string; order: number; badgeClass: string; dotClass: string }`
  - `function isBottleTrackedSlug(slug: string | null | undefined): boolean`
  - `const DEFAULT_ALERT_LEVEL: BottleLevel` (= `"almost_empty"`)
  - `function needsRestock(level: BottleLevel | null | undefined, reserve: number | null | undefined, alertLevel: BottleLevel | null | undefined): boolean`

- [ ] **Step 1: Escribir el test (falla porque el módulo no existe)**

Create `scripts/bottle.test.ts`:

```typescript
import {
  BOTTLE_LEVELS,
  BOTTLE_TRACKING_SLUGS,
  DEFAULT_ALERT_LEVEL,
  bottleLevelOrder,
  bottleLevelMeta,
  isBottleLevel,
  isBottleTrackedSlug,
  needsRestock,
} from "../src/lib/bottle";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error("✗ FAIL:", msg); }
}

// Orden de niveles
assert(bottleLevelOrder("full") === 5, "full es 5");
assert(bottleLevelOrder("almost_empty") === 1, "almost_empty es 1");
assert(bottleLevelOrder("full") > bottleLevelOrder("half"), "full > half");

// BOTTLE_LEVELS ordenado de lleno a casi vacío
assert(BOTTLE_LEVELS[0].key === "full", "primer nivel es full");
assert(BOTTLE_LEVELS[BOTTLE_LEVELS.length - 1].key === "almost_empty", "último nivel es almost_empty");
assert(BOTTLE_LEVELS.length === 5, "hay 5 niveles");

// meta
assert(bottleLevelMeta("almost_empty").label.length > 0, "almost_empty tiene label");

// type guard
assert(isBottleLevel("half") === true, "half es nivel válido");
assert(isBottleLevel("lleno") === false, "lleno no es clave válida");
assert(isBottleLevel(null) === false, "null no es nivel");

// slug detection
assert(isBottleTrackedSlug("cocteles") === true, "cocteles es tracked");
assert(isBottleTrackedSlug("licores") === false, "licores no es tracked");
assert(isBottleTrackedSlug(null) === false, "null no es tracked");
assert(BOTTLE_TRACKING_SLUGS.includes("cocteles"), "constante incluye cocteles");
assert(DEFAULT_ALERT_LEVEL === "almost_empty", "default alert es almost_empty");

// needsRestock: nivel <= umbral Y reserva === 0
assert(needsRestock("almost_empty", 0, null) === true, "casi vacía + sin reserva + default => alerta");
assert(needsRestock("almost_empty", 1, null) === false, "casi vacía + 1 reserva => NO alerta");
assert(needsRestock("full", 0, null) === false, "llena + sin reserva => NO alerta");
assert(needsRestock("quarter", 0, "quarter") === true, "1/4 + sin reserva + umbral 1/4 => alerta");
assert(needsRestock("half", 0, "quarter") === false, "mitad (3) > umbral 1/4 (2) => NO alerta");
assert(needsRestock("quarter", 0, "half") === true, "1/4 (2) <= umbral mitad (3) => alerta");
assert(needsRestock(null, 0, null) === false, "sin nivel registrado => NO alerta");
assert(needsRestock("almost_empty", null, null) === true, "reserva null se trata como 0 => alerta");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx tsx scripts/bottle.test.ts`
Expected: FAIL — error de módulo no encontrado (`Cannot find module '../src/lib/bottle'`).

- [ ] **Step 3: Implementar `src/lib/bottle.ts`**

```typescript
// src/lib/bottle.ts
// Control de licores por nivel de botella (subcategoría Cócteles).
// Lógica pura: sin dependencias de React/Prisma para poder testearse aislada.

export type BottleLevel =
  | "full"
  | "three_quarters"
  | "half"
  | "quarter"
  | "almost_empty";

/** Slugs de subcategoría cuyos productos se controlan por nivel de botella. */
export const BOTTLE_TRACKING_SLUGS: readonly string[] = ["cocteles"];

/** Nivel de alerta por defecto cuando el producto no define uno propio. */
export const DEFAULT_ALERT_LEVEL: BottleLevel = "almost_empty";

interface BottleLevelDef {
  key: BottleLevel;
  label: string;
  order: number;
  /** Clase del badge de estado (lectura). */
  badgeClass: string;
  /** Clase del punto/segmento de color (selector). */
  dotClass: string;
}

/** Niveles ordenados de lleno (5) a casi vacío (1). El orden es la fuente de verdad. */
export const BOTTLE_LEVELS: readonly BottleLevelDef[] = [
  { key: "full",           label: "Llena",      order: 5, badgeClass: "bg-emerald-100 text-emerald-700", dotClass: "bg-emerald-500" },
  { key: "three_quarters", label: "3/4",        order: 4, badgeClass: "bg-emerald-100 text-emerald-700", dotClass: "bg-emerald-500" },
  { key: "half",           label: "Mitad",      order: 3, badgeClass: "bg-amber-100 text-amber-700",     dotClass: "bg-amber-500" },
  { key: "quarter",        label: "1/4",        order: 2, badgeClass: "bg-orange-100 text-orange-700",   dotClass: "bg-orange-500" },
  { key: "almost_empty",   label: "Casi vacía", order: 1, badgeClass: "bg-red-100 text-red-700",         dotClass: "bg-red-500" },
];

const LEVEL_BY_KEY = new Map<BottleLevel, BottleLevelDef>(
  BOTTLE_LEVELS.map((l) => [l.key, l])
);

export function isBottleLevel(v: unknown): v is BottleLevel {
  return typeof v === "string" && LEVEL_BY_KEY.has(v as BottleLevel);
}

export function bottleLevelMeta(level: BottleLevel): BottleLevelDef {
  const meta = LEVEL_BY_KEY.get(level);
  if (!meta) throw new Error(`Nivel de botella desconocido: ${level}`);
  return meta;
}

export function bottleLevelOrder(level: BottleLevel): number {
  return bottleLevelMeta(level).order;
}

/** ¿La subcategoría con este slug se controla por nivel de botella? */
export function isBottleTrackedSlug(slug: string | null | undefined): boolean {
  return !!slug && BOTTLE_TRACKING_SLUGS.includes(slug);
}

/**
 * Regla de alerta de compra:
 *   orden(nivel) <= orden(umbral ?? default)  Y  (reserva ?? 0) === 0
 * Un producto sin nivel registrado (null) nunca alerta.
 */
export function needsRestock(
  level: BottleLevel | null | undefined,
  reserve: number | null | undefined,
  alertLevel: BottleLevel | null | undefined
): boolean {
  if (!isBottleLevel(level)) return false;
  const threshold = isBottleLevel(alertLevel) ? alertLevel : DEFAULT_ALERT_LEVEL;
  const hasReserve = (reserve ?? 0) > 0;
  return bottleLevelOrder(level) <= bottleLevelOrder(threshold) && !hasReserve;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx tsx scripts/bottle.test.ts`
Expected: PASS — `26 passed, 0 failed` (o similar, 0 failed).

- [ ] **Step 5: Eliminar el test temporal y commitear**

```bash
rm scripts/bottle.test.ts
git add src/lib/bottle.ts
git commit -m "feat(bottle): helper de niveles de botella y regla de alerta"
```

---

## Task 2: Campos de schema (`prisma/schema.prisma`)

**Files:**
- Modify: `prisma/schema.prisma` (model `Product`, model `DailyInventoryItem`)

**Interfaces:**
- Consumes: nada.
- Produces: campos Prisma `Product.bottleLevel`, `Product.reserveBottles`, `Product.alertBottleLevel`, `DailyInventoryItem.bottleLevel`, `DailyInventoryItem.reserveBottles` (todos opcionales).

- [ ] **Step 1: Añadir campos a `Product`**

En `model Product`, después de `imageUrl String?` (línea ~36), añadir:

```prisma
  // Control por nivel de botella (solo subcategoría Cócteles; null en el resto).
  // bottleLevel: "full" | "three_quarters" | "half" | "quarter" | "almost_empty"
  bottleLevel      String?
  reserveBottles   Int?
  // Umbral de alerta de compra; null = "almost_empty" por defecto.
  alertBottleLevel String?
```

- [ ] **Step 2: Añadir campos a `DailyInventoryItem`**

En `model DailyInventoryItem`, después de `unregEntryTime String?` (línea ~124), añadir:

```prisma
  // Snapshot del control por botella al cierre de la jornada (solo ítems de cócteles).
  bottleLevel      String?
  reserveBottles   Int?
```

- [ ] **Step 3: Aplicar el schema y regenerar cliente**

Run:
```bash
npx prisma db push
npx prisma generate
```
Expected: `db push` reporta los campos añadidos sin pérdida de datos; `generate` termina sin error.

- [ ] **Step 4: Verificar que compila el tipo Prisma**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: Sin errores nuevos relacionados con los campos (puede haber errores preexistentes ajenos; no introducir nuevos).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): campos de nivel de botella en Product y DailyInventoryItem"
```

---

## Task 3: Componente selector de nivel (`bottle-level-selector.tsx`)

**Files:**
- Create: `src/components/inventario/bottle-level-selector.tsx`

**Interfaces:**
- Consumes: `BottleLevel`, `BOTTLE_LEVELS` de `src/lib/bottle.ts`.
- Produces:
  - `function BottleLevelSelector(props: { value: BottleLevel | null; onChange: (v: BottleLevel) => void; disabled?: boolean }): JSX.Element`
  - `function ReserveCounter(props: { value: number; onChange: (v: number) => void; disabled?: boolean }): JSX.Element`
  - `function BottleLevelBadge(props: { level: BottleLevel | null }): JSX.Element` (lectura, vista cerrada)

- [ ] **Step 1: Implementar el componente**

```tsx
"use client";

import { Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BOTTLE_LEVELS, bottleLevelMeta, type BottleLevel } from "@/lib/bottle";

export function BottleLevelSelector({
  value,
  onChange,
  disabled,
}: {
  value: BottleLevel | null;
  onChange: (v: BottleLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BOTTLE_LEVELS.map((lvl) => {
        const selected = value === lvl.key;
        return (
          <button
            key={lvl.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(lvl.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? `${lvl.badgeClass} border-transparent ring-2 ring-offset-1 ring-slate-300`
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", lvl.dotClass)} />
            {lvl.label}
          </button>
        );
      })}
    </div>
  );
}

export function ReserveCounter({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Disminuir reserva"
      >
        <Minus className="w-3.5 h-3.5" />
      </Button>
      <span className="w-8 text-center tabular-nums text-sm font-semibold text-slate-800">
        {value}
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label="Aumentar reserva"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function BottleLevelBadge({ level }: { level: BottleLevel | null }) {
  if (!level) return <span className="text-slate-400 text-sm">—</span>;
  const meta = bottleLevelMeta(level);
  return <Badge className={`${meta.badgeClass} border-0`}>{meta.label}</Badge>;
}
```

- [ ] **Step 2: Verificar lint + tipos**

Run: `pnpm lint`
Expected: Sin errores nuevos en `src/components/inventario/bottle-level-selector.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventario/bottle-level-selector.tsx
git commit -m "feat(ui): selector de nivel de botella, contador de reserva y badge"
```

---

## Task 4: Backend — abrir inventario con ítems de botella

**Files:**
- Modify: `src/app/api/daily-inventory/route.ts`

**Interfaces:**
- Consumes: `isBottleTrackedSlug`, `isBottleLevel`, `BottleLevel` de `src/lib/bottle.ts`.
- Produces: POST acepta items con `bottleLevel?: string | null` y `reserveBottles?: number | null`; los ítems de botella se crean con snapshot y sin movimiento de stock.

- [ ] **Step 1: Extender `loadRootCategory` para conocer la subcategoría de cada producto**

En `loadRootCategory` (línea ~21), cambiar la consulta de productos para traer `categoryId` y construir un mapa producto→slug de subcategoría. Reemplazar el cuerpo:

```typescript
async function loadRootCategory(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, slug: true, parentId: true, children: { select: { id: true, slug: true } } },
  });
  if (!category || category.parentId) return null; // debe ser categoría raíz
  const slugByCat = new Map<string, string | null>([[category.id, category.slug]]);
  for (const c of category.children) slugByCat.set(c.id, c.slug);
  const catIds = [category.id, ...category.children.map((c) => c.id)];
  const products = await prisma.product.findMany({
    where: { categoryId: { in: catIds } },
    select: { id: true, active: true, categoryId: true },
  });
  const active = products.filter((p) => p.active);
  const productIds = new Set(active.map((p) => p.id));
  const slugByProduct = new Map<string, string | null>(
    active.map((p) => [p.id, p.categoryId ? slugByCat.get(p.categoryId) ?? null : null])
  );
  return { category, productIds, slugByProduct };
}
```

- [ ] **Step 2: Añadir el import del helper**

Al inicio del archivo, junto a los imports existentes:

```typescript
import { isBottleTrackedSlug, isBottleLevel } from "@/lib/bottle";
```

- [ ] **Step 3: Extender el tipo `CreateItem`**

Reemplazar la interfaz `CreateItem`:

```typescript
interface CreateItem {
  productId: string;
  initialCount: number;
  note?: string;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
}
```

- [ ] **Step 4: Ajustar validación de items en POST**

En POST, la validación actual (línea ~124) exige `initialCount` numérico ≥ 0 para todos. Reemplazar el bloque `const invalid = ...` por uno que exima a los ítems de botella y valide sus campos:

```typescript
  const invalid = items.some((i) => {
    if (typeof i.productId !== "string") return true;
    const isBottle = isBottleTrackedSlug(loaded.slugByProduct.get(i.productId));
    if (isBottle) {
      if (i.bottleLevel != null && !isBottleLevel(i.bottleLevel)) return true;
      if (i.reserveBottles != null && (typeof i.reserveBottles !== "number" || i.reserveBottles < 0 || !Number.isInteger(i.reserveBottles))) return true;
      return false;
    }
    return typeof i.initialCount !== "number" || i.initialCount < 0;
  });
  if (invalid) {
    return NextResponse.json({ error: "Datos inválidos en items" }, { status: 400 });
  }
```

- [ ] **Step 5: Crear los ítems con snapshot de botella**

Reemplazar el `items: { create: ... }` dentro de `prisma.dailyInventory.create` (línea ~154) para incluir los campos de botella, usando `initialCount: 0` en ítems de botella:

```typescript
      items: {
        create: items.map((i) => {
          const isBottle = isBottleTrackedSlug(loaded.slugByProduct.get(i.productId));
          return {
            productId: i.productId,
            initialCount: isBottle ? 0 : i.initialCount,
            bottleLevel: isBottle && isBottleLevel(i.bottleLevel) ? i.bottleLevel : null,
            reserveBottles: isBottle ? (i.reserveBottles ?? 0) : null,
          };
        }),
      },
```

- [ ] **Step 6: Excluir ítems de botella de la reconciliación de stock**

En el `prisma.$transaction` de reconciliación de apertura (línea ~167), saltar los ítems de botella para que no generen movimiento ni ajuste de stock. Cambiar el inicio del `for`:

```typescript
  await prisma.$transaction(async (tx) => {
    for (const item of inventory.items) {
      if (isBottleTrackedSlug(loaded.slugByProduct.get(item.productId))) continue; // ítems de botella no tocan stock
      const delta = item.initialCount - item.product.currentStock;
      if (delta === 0) continue;
      // ... resto sin cambios
```

- [ ] **Step 7: Verificar lint + build parcial**

Run: `pnpm lint`
Expected: Sin errores nuevos en `src/app/api/daily-inventory/route.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/daily-inventory/route.ts
git commit -m "feat(daily): abrir inventario con ítems de botella sin tocar stock"
```

---

## Task 5: Backend — cerrar inventario con ítems de botella

**Files:**
- Modify: `src/app/api/daily-inventory/[id]/route.ts`

**Interfaces:**
- Consumes: `isBottleTrackedSlug`, `isBottleLevel` de `src/lib/bottle.ts`.
- Produces: PATCH (cerrar) acepta en cada item `bottleLevel?: string | null` y `reserveBottles?: number | null`; los ítems de botella guardan snapshot en `DailyInventoryItem` y actualizan `Product`, sin `StockMovement` ni cambio de `currentStock`.

- [ ] **Step 1: Importar helper y resolver productos de botella**

Añadir import al inicio:

```typescript
import { isBottleTrackedSlug, isBottleLevel } from "@/lib/bottle";
```

- [ ] **Step 2: Extender el tipo `FinalCountItem`**

Reemplazar la interfaz:

```typescript
interface FinalCountItem {
  productId: string;
  finalCount: number;
  unregisteredEntry?: number | null;
  unregisteredExit?: number | null;
  entryReason?: string | null;
  entryTime?: string | null;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
}
```

- [ ] **Step 3: Cargar el slug de subcategoría de cada producto del inventario**

Después de cargar `inventory` con sus items (línea ~135), añadir la resolución de qué productos son de botella. Insertar tras `if (inventory.status === "closed") { ... }` (línea ~143):

```typescript
  // Resolver qué productos del inventario son de control por botella (slug de su subcategoría).
  const invProducts = await prisma.product.findMany({
    where: { id: { in: inventory.items.map((i) => i.productId) } },
    select: { id: true, category: { select: { slug: true } } },
  });
  const bottleProductIds = new Set(
    invProducts.filter((p) => isBottleTrackedSlug(p.category?.slug)).map((p) => p.id)
  );
```

- [ ] **Step 4: Validar finalCounts permitiendo ítems de botella**

La validación `const invalid = ...` (línea ~123) exige `finalCount` numérico ≥ 0 para todos. Reemplazar por una que exima a los ítems de botella:

```typescript
  const finalCounts = body.finalCounts as FinalCountItem[];
  const invalid = finalCounts.some((fc) => {
    if (typeof fc.productId !== "string") return true;
    if (bottleProductIds.has(fc.productId)) {
      if (fc.bottleLevel != null && !isBottleLevel(fc.bottleLevel)) return true;
      if (fc.reserveBottles != null && (typeof fc.reserveBottles !== "number" || fc.reserveBottles < 0 || !Number.isInteger(fc.reserveBottles))) return true;
      return false;
    }
    return (
      typeof fc.finalCount !== "number" ||
      fc.finalCount < 0 ||
      (fc.unregisteredEntry != null && (typeof fc.unregisteredEntry !== "number" || fc.unregisteredEntry < 0)) ||
      (fc.unregisteredExit != null && (typeof fc.unregisteredExit !== "number" || fc.unregisteredExit < 0))
    );
  });
  if (invalid) {
    return NextResponse.json({ error: "Datos inválidos en finalCounts" }, { status: 400 });
  }
```

> Nota: mover la línea `const finalCounts = body.finalCounts as FinalCountItem[];` para que quede antes de esta validación (ya existe en línea ~122; conservar una sola declaración).

- [ ] **Step 5: Excluir ítems de botella del pre-cálculo numérico**

El `const computed = finalCounts.map(...)` (línea ~182) calcula NR y esperado. Filtrar fuera los ítems de botella añadiendo al `.filter(...)`:

```typescript
  const computed = finalCounts
    .map((fc) => ({ fc, item: inventory.items.find((i) => i.productId === fc.productId) }))
    .filter((c): c is { fc: FinalCountItem; item: (typeof inventory.items)[number] } => !!c.item)
    .filter((c) => !bottleProductIds.has(c.fc.productId)) // los de botella se procesan aparte
    .map(({ fc, item }) => {
      // ... cuerpo sin cambios
```

- [ ] **Step 6: Persistir snapshot de botella dentro de la transacción**

Dentro del `prisma.$transaction` (línea ~221), después del `for (const c of computed) { ... }` y antes del `await tx.dailyInventory.update({ ... status: "closed" ... })`, añadir el procesamiento de ítems de botella:

```typescript
    // Ítems de botella: persistir snapshot en el item y reflejarlo en el producto.
    // No generan StockMovement ni modifican currentStock.
    for (const fc of finalCounts) {
      if (!bottleProductIds.has(fc.productId)) continue;
      const item = inventory.items.find((i) => i.productId === fc.productId);
      if (!item) continue;
      const level = isBottleLevel(fc.bottleLevel) ? fc.bottleLevel : null;
      const reserve = fc.reserveBottles ?? 0;
      await tx.dailyInventoryItem.update({
        where: { id: item.id },
        data: { bottleLevel: level, reserveBottles: reserve },
      });
      await tx.product.update({
        where: { id: fc.productId },
        data: { bottleLevel: level, reserveBottles: reserve },
      });
    }
```

- [ ] **Step 7: Verificar lint**

Run: `pnpm lint`
Expected: Sin errores nuevos en `src/app/api/daily-inventory/[id]/route.ts`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/daily-inventory/[id]/route.ts"
git commit -m "feat(daily): cerrar inventario guardando snapshot de botella sin tocar stock"
```

---

## Task 6: Pasar slug de subcategoría a la UI del inventario diario

**Files:**
- Modify: `src/app/(dashboard)/inventario-diario/page.tsx`

**Interfaces:**
- Consumes: nada nuevo (usa `category.slug` ya incluido en `allProducts`).
- Produces: cada producto pasado a `DailyInventoryClient` incluye `category: { name, slug }` (antes solo `name`). El `existing.items[].product` también incluye `category: { slug }`.

- [ ] **Step 1: Incluir slug en `allProducts`**

En la consulta `allProducts` (línea ~104), cambiar `include: { category: { select: { name: true } } }` por:

```typescript
    include: { category: { select: { name: true, slug: true } } },
```

- [ ] **Step 2: Incluir slug del producto en los items existentes**

En la consulta `existing` (línea ~110), el `product: { select: ... }` no trae categoría. Cambiar a incluirla:

```typescript
        include: { product: { select: { id: true, name: true, unit: true, currentStock: true, bottleLevel: true, reserveBottles: true, category: { select: { slug: true } } } } },
```

> Esto también trae `bottleLevel`/`reserveBottles` actuales del producto para precargar al reabrir.

- [ ] **Step 3: Verificar lint**

Run: `pnpm lint`
Expected: Sin errores nuevos (puede haber error de tipos en `daily-inventory-client.tsx` hasta la Task 7; si aparece, se resuelve allí).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/inventario-diario/page.tsx"
git commit -m "feat(daily): exponer slug de subcategoría y nivel de botella a la UI"
```

---

## Task 7: UI del inventario diario — render condicional + "Mantener igual"

**Files:**
- Modify: `src/app/(dashboard)/inventario-diario/daily-inventory-client.tsx`

**Interfaces:**
- Consumes: `BottleLevel`, `isBottleTrackedSlug`, `isBottleLevel` de `src/lib/bottle.ts`; `BottleLevelSelector`, `ReserveCounter`, `BottleLevelBadge` de `src/components/inventario/bottle-level-selector.tsx`.
- Produces: UI que renderiza el bloque de Cócteles con selector de nivel + reserva en abrir/cerrar, lectura en cerrado, y botón "Mantener igual"; envía `bottleLevel`/`reserveBottles` en los payloads de POST y PATCH.

- [ ] **Step 1: Actualizar imports y tipos**

Añadir imports:

```typescript
import { BottleLevelSelector, ReserveCounter, BottleLevelBadge } from "@/components/inventario/bottle-level-selector";
import { isBottleTrackedSlug, isBottleLevel, type BottleLevel } from "@/lib/bottle";
```

Extender la interfaz `Product` (línea ~36) y `InventoryItem` (línea ~44) y `product` interno:

```typescript
interface Product {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  category: { name: string; slug: string | null } | null;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
}

interface InventoryItem {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string; currentStock: number; bottleLevel?: string | null; reserveBottles?: number | null; category?: { slug: string | null } | null };
  initialCount: number;
  finalCount: number | null;
  unregisteredEntry: number | null;
  unregisteredExit: number | null;
  unregEntryReason?: string | null;
  unregEntryTime?: string | null;
  bottleLevel?: string | null;
  reserveBottles?: number | null;
}
```

- [ ] **Step 2: Helper local para saber si un item/producto es de botella**

Cerca de los helpers (tras `parseField`, línea ~125), añadir:

```typescript
function productIsBottle(p: { category?: { slug: string | null } | null }): boolean {
  return isBottleTrackedSlug(p.category?.slug ?? null);
}
```

- [ ] **Step 3: CreateView — estado y render del bloque de botella**

En `CreateView` (línea ~346), añadir estado para niveles y reservas:

```typescript
  const [levels, setLevels] = useState<Record<string, BottleLevel>>(() =>
    Object.fromEntries(
      allProducts
        .filter((p) => productIsBottle(p) && isBottleLevel(p.bottleLevel))
        .map((p) => [p.id, p.bottleLevel as BottleLevel])
    )
  );
  const [reserves, setReserves] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      allProducts.filter((p) => productIsBottle(p)).map((p) => [p.id, p.reserveBottles ?? 0])
    )
  );

  function keepSameBottles() {
    const nextLevels: Record<string, BottleLevel> = {};
    const nextReserves: Record<string, number> = {};
    for (const p of allProducts) {
      if (!productIsBottle(p)) continue;
      if (isBottleLevel(p.bottleLevel)) nextLevels[p.id] = p.bottleLevel as BottleLevel;
      nextReserves[p.id] = p.reserveBottles ?? 0;
    }
    setLevels(nextLevels);
    setReserves(nextReserves);
    toast.success("Niveles copiados del último registro");
  }
```

Modificar `buildItems` en CreateView para incluir los campos de botella:

```typescript
  function buildItems(): StartItem[] {
    return allProducts.map((p) => {
      if (productIsBottle(p)) {
        return {
          productId: p.id,
          initialCount: 0,
          bottleLevel: levels[p.id] ?? null,
          reserveBottles: reserves[p.id] ?? 0,
        };
      }
      return { productId: p.id, initialCount: parseFloat(counts[p.id] ?? "") || 0 };
    });
  }
```

Extender la interfaz `StartItem` (línea ~340):

```typescript
interface StartItem {
  productId: string;
  initialCount: number;
  note?: string;
  bottleLevel?: BottleLevel | null;
  reserveBottles?: number | null;
}
```

En el render de cada bloque por categoría (el `.map(([cat, products]) => ...)`, línea ~447), reemplazar la tabla por una rama condicional: si TODOS los productos del bloque son de botella, renderizar el bloque de botella; si no, la tabla numérica actual. Cambiar el contenido del `<div key={cat} ...>`:

```tsx
          <div key={cat} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat}</span>
              {products.every(productIsBottle) && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={keepSameBottles}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Mantener igual
                </Button>
              )}
            </div>
            {products.every(productIsBottle) ? (
              <div className="divide-y divide-slate-100">
                {products.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                    <div className="flex flex-wrap items-center gap-4">
                      <BottleLevelSelector
                        value={levels[p.id] ?? null}
                        onChange={(v) => setLevels((prev) => ({ ...prev, [p.id]: v }))}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Reserva</span>
                        <ReserveCounter
                          value={reserves[p.id] ?? 0}
                          onChange={(v) => setReserves((prev) => ({ ...prev, [p.id]: v }))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full text-sm">
                {/* tabla numérica existente, sin cambios */}
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Producto</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Stock sistema</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500 w-36">Conteo inicial *</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {products.map((p) => {
                    const isEmpty = !counts[p.id] || counts[p.id] === "0" || counts[p.id] === "";
                    return (
                      <tr key={p.id} className={isEmpty ? "bg-red-50/40" : ""}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
                          {formatStock(p.currentStock, p.unit)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            className={`w-28 ml-auto text-right tabular-nums ${isEmpty ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                            value={counts[p.id] ?? ""}
                            onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
```

> El control de "ceros" y "discrepancias" en `handleStart` debe ignorar ítems de botella. Cambiar el cálculo de `zeroNames` para excluirlos:

```typescript
    const zeroNames = items
      .filter((i) => {
        const p = allProducts.find((pr) => pr.id === i.productId);
        return p && !productIsBottle(p) && i.initialCount === 0;
      })
      .map((i) => allProducts.find((p) => p.id === i.productId)?.name ?? i.productId);
```

Y `computeDiscRows` debe saltar ítems de botella (añadir guard al inicio del `.map`):

```typescript
        const p = allProducts.find((pr) => pr.id === i.productId);
        if (!p || productIsBottle(p)) return null;
```

- [ ] **Step 4: OpenView — estado y render del bloque de botella al cerrar**

En `OpenView` (línea ~647), agrupar los items por subcategoría para poder renderizar el bloque de botella aparte. Añadir estado:

```typescript
  const [bottleLevels, setBottleLevels] = useState<Record<string, BottleLevel>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => productIsBottle(i.product))
        .map((i) => {
          const lvl = isBottleLevel(i.bottleLevel) ? i.bottleLevel : (isBottleLevel(i.product.bottleLevel) ? i.product.bottleLevel : null);
          return [i.productId, lvl];
        })
        .filter((e): e is [string, BottleLevel] => e[1] !== null)
    )
  );
  const [bottleReserves, setBottleReserves] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      inventory.items
        .filter((i) => productIsBottle(i.product))
        .map((i) => [i.productId, i.reserveBottles ?? i.product.reserveBottles ?? 0])
    )
  );

  const bottleItems = inventory.items.filter((i) => productIsBottle(i.product));
  const numericItems = inventory.items.filter((i) => !productIsBottle(i.product));

  function keepSameBottles() {
    const nextLevels: Record<string, BottleLevel> = {};
    const nextReserves: Record<string, number> = {};
    for (const i of bottleItems) {
      const lvl = isBottleLevel(i.product.bottleLevel) ? i.product.bottleLevel as BottleLevel : (isBottleLevel(i.bottleLevel) ? i.bottleLevel as BottleLevel : null);
      if (lvl) nextLevels[i.productId] = lvl;
      nextReserves[i.productId] = i.product.reserveBottles ?? i.reserveBottles ?? 0;
    }
    setBottleLevels(nextLevels);
    setBottleReserves(nextReserves);
    toast.success("Niveles copiados del último registro");
  }
```

El `rows` (useMemo, línea ~699) debe construirse solo sobre `numericItems` para no producir NaN en los de botella. Cambiar `inventory.items.map(...)` por `numericItems.map(...)` y la dependencia `[inventory.items, ...]` por `[numericItems, ...]`.

`buildItems` (línea ~752) debe combinar filas numéricas + ítems de botella:

```typescript
  function buildItems(): CloseItem[] {
    const numeric = rows.map((r) => ({
      productId: r.item.productId,
      finalCount: parseField(r.finalStr) ?? 0,
      unregisteredEntry: parseField(r.entryStr),
      unregisteredExit: parseField(r.exitStr),
      entryReason: r.effEntry > 0 ? (entryReasons[r.item.productId]?.trim() || null) : null,
      entryTime: r.effEntry > 0 ? (entryTimes[r.item.productId]?.trim() || null) : null,
      bottleLevel: null,
      reserveBottles: null,
    }));
    const bottles = bottleItems.map((i) => ({
      productId: i.productId,
      finalCount: 0,
      unregisteredEntry: null,
      unregisteredExit: null,
      entryReason: null,
      entryTime: null,
      bottleLevel: bottleLevels[i.productId] ?? null,
      reserveBottles: bottleReserves[i.productId] ?? 0,
    }));
    return [...numeric, ...bottles];
  }
```

Extender `CloseItem` (línea ~532):

```typescript
interface CloseItem {
  productId: string;
  finalCount: number;
  unregisteredEntry: number | null;
  unregisteredExit: number | null;
  entryReason: string | null;
  entryTime: string | null;
  bottleLevel: BottleLevel | null;
  reserveBottles: number | null;
}
```

En el render de `OpenView`, antes de la `<table>` numérica (línea ~823), añadir el bloque de botella si existe:

```tsx
        {bottleItems.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cócteles · nivel de botella</span>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={keepSameBottles}>
                <RefreshCw className="w-3 h-3 mr-1" /> Mantener igual
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {bottleItems.map((i) => (
                <div key={i.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <span className="font-medium text-slate-800 text-sm">{i.product.name}</span>
                  <div className="flex flex-wrap items-center gap-4">
                    <BottleLevelSelector
                      value={bottleLevels[i.productId] ?? null}
                      onChange={(v) => setBottleLevels((prev) => ({ ...prev, [i.productId]: v }))}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Reserva</span>
                      <ReserveCounter
                        value={bottleReserves[i.productId] ?? 0}
                        onChange={(v) => setBottleReserves((prev) => ({ ...prev, [i.productId]: v }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
```

> Si `numericItems.length === 0`, envolver la `<table>` numérica y su contenedor en `{numericItems.length > 0 && ( ... )}` para no mostrar una tabla vacía.

- [ ] **Step 5: ClosedView — lectura del bloque de botella**

En `ClosedView` (línea ~968), separar ítems de botella. Tras `const rows = inventory.items.map(...)` (línea ~1004), cambiar para excluir botellas del cálculo numérico:

```typescript
  const bottleItems = inventory.items.filter((i) => productIsBottle(i.product));
  const numericItems = inventory.items.filter((i) => !productIsBottle(i.product));
  const rows = numericItems.map((item) => {
    // ... cuerpo sin cambios
```

Antes de la `<table>` de resultados (línea ~1045), añadir el bloque de lectura de botella:

```tsx
      {bottleItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cócteles · nivel de botella</span>
          </div>
          <div className="divide-y divide-slate-100">
            {bottleItems.map((i) => (
              <div key={i.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="font-medium text-slate-800 text-sm">{i.product.name}</span>
                <div className="flex items-center gap-3">
                  <BottleLevelBadge level={isBottleLevel(i.bottleLevel) ? i.bottleLevel : null} />
                  <span className="text-xs text-slate-500">Reserva: <strong className="tabular-nums">{i.reserveBottles ?? 0}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
```

> Igual que en OpenView, envolver la `<table>` numérica en `{numericItems.length > 0 && ( ... )}`.

- [ ] **Step 6: Verificar lint + build**

Run: `pnpm lint && pnpm build`
Expected: Build exitoso, sin errores de TypeScript. (Si `pnpm build` requiere DB, ya está creada por `db push`.)

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/inventario-diario/daily-inventory-client.tsx"
git commit -m "feat(daily): UI de nivel de botella en abrir/cerrar/cerrado + mantener igual"
```

---

## Task 8: Alertas de reposición de botella

**Files:**
- Modify: `src/app/(dashboard)/alertas/page.tsx`
- Modify: `src/app/(dashboard)/alertas/alertas-client.tsx`

**Interfaces:**
- Consumes: `needsRestock`, `isBottleLevel`, `bottleLevelMeta`, `isBottleTrackedSlug`, `BottleLevel` de `src/lib/bottle.ts`.
- Produces: `AlertasClient` recibe prop adicional `bottleAlerts: BottleAlertItem[]`.

- [ ] **Step 1: Calcular alertas de botella en `alertas/page.tsx`**

Tras el cálculo de `alerts` (línea ~16), añadir la consulta y cálculo de alertas de botella, y pasarlas al cliente:

```typescript
  const bottleProducts = await prisma.product.findMany({
    where: { active: true, bottleLevel: { not: null } },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const bottleAlerts = bottleProducts
    .filter((p) => isBottleTrackedSlug(p.category?.slug ?? null))
    .filter((p) =>
      needsRestock(
        isBottleLevel(p.bottleLevel) ? p.bottleLevel : null,
        p.reserveBottles,
        isBottleLevel(p.alertBottleLevel) ? p.alertBottleLevel : null
      )
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? "Cócteles",
      levelLabel: isBottleLevel(p.bottleLevel) ? bottleLevelMeta(p.bottleLevel).label : "—",
      reserve: p.reserveBottles ?? 0,
    }));
```

Añadir imports al inicio:

```typescript
import { needsRestock, isBottleLevel, bottleLevelMeta, isBottleTrackedSlug } from "@/lib/bottle";
```

Pasar al cliente y ajustar el subtítulo:

```tsx
      <AlertasClient alerts={alerts} bottleAlerts={bottleAlerts} />
```

Y actualizar el contador del encabezado para sumar ambos:

```tsx
        <p className="text-slate-500 text-sm mt-1">
          {alerts.length + bottleAlerts.length > 0
            ? `${alerts.length + bottleAlerts.length} alerta${alerts.length + bottleAlerts.length !== 1 ? "s" : ""} de reposición`
            : "Todo el stock está en orden"}
        </p>
```

- [ ] **Step 2: Renderizar alertas de botella en `alertas-client.tsx`**

Añadir el tipo e integrar la prop. Tras la interfaz `AlertItem` (línea ~9):

```typescript
interface BottleAlertItem {
  id: string;
  name: string;
  category: string;
  levelLabel: string;
  reserve: number;
}
```

Cambiar la firma del componente:

```typescript
export function AlertasClient({ alerts, bottleAlerts }: { alerts: AlertItem[]; bottleAlerts: BottleAlertItem[] }) {
```

Cambiar el early-return de "todo en orden" para considerar ambos:

```typescript
  if (alerts.length === 0 && bottleAlerts.length === 0) {
```

Incluir los licores en la lista de compras copiable (dentro de `copyShoppingList`, tras construir `lines`):

```typescript
    const bottleLines = bottleAlerts.map(
      (b) => `• ${b.name} (${b.category}): ${b.levelLabel}, sin reserva → comprar`
    );
    const allLines = [...lines, ...bottleLines];
    const text = `Lista de compras — ${new Date().toLocaleDateString("es-CO")}\n\n${allLines.join("\n")}`;
```

(reemplazando el `const text = ...` existente y el `lines.join` por `allLines`).

Antes del bloque de la tabla numérica (return principal), añadir la sección de botella:

```tsx
      {bottleAlerts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Licores de cócteles por reponer ({bottleAlerts.length})
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {bottleAlerts.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{b.name}</div>
                  <div className="text-xs text-slate-400">{b.category}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge className="bg-red-100 text-red-700 border-0">{b.levelLabel}, sin reserva</Badge>
                  <span className="text-xs text-slate-500">Comprar</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
```

> El botón "Copiar lista de compras" debe mostrarse si hay cualquiera de los dos tipos: cambiar nada si ya está dentro del return general; asegurarse de que el `<div className="flex justify-end">` con el botón quede visible cuando `alerts.length === 0` pero `bottleAlerts.length > 0`. Si la tabla numérica está condicionada a `alerts`, envolver `<div className="bg-white ...table...>` en `{alerts.length > 0 && ( ... )}`.

- [ ] **Step 3: Verificar lint + build**

Run: `pnpm lint && pnpm build`
Expected: Build exitoso.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/alertas/page.tsx" "src/app/(dashboard)/alertas/alertas-client.tsx"
git commit -m "feat(alertas): alertas de reposición de licores por nivel de botella"
```

---

## Task 9: Contador de alertas en el dashboard

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `needsRestock`, `isBottleLevel`, `isBottleTrackedSlug` de `src/lib/bottle.ts`.
- Produces: el stat "Alertas de stock" incluye los licores de cócteles por reponer.

- [ ] **Step 1: Importar helpers**

```typescript
import { needsRestock, isBottleLevel, isBottleTrackedSlug } from "@/lib/bottle";
```

- [ ] **Step 2: Consultar y sumar alertas de botella**

En el `Promise.all` (línea ~16), añadir una consulta `bottleAlertProducts`:

```typescript
    prisma.product.findMany({
      where: { active: true, bottleLevel: { not: null } },
      select: { bottleLevel: true, reserveBottles: true, alertBottleLevel: true, category: { select: { slug: true } } },
    }),
```

(añadirla como nuevo elemento del array destructurado: agregar `bottleAlertProducts` a la lista de variables).

Tras `const alertCount = ...` (línea ~38), calcular y sumar:

```typescript
  const bottleAlertCount = bottleAlertProducts.filter(
    (p) =>
      isBottleTrackedSlug(p.category?.slug ?? null) &&
      needsRestock(
        isBottleLevel(p.bottleLevel) ? p.bottleLevel : null,
        p.reserveBottles,
        isBottleLevel(p.alertBottleLevel) ? p.alertBottleLevel : null
      )
  ).length;
  const totalAlerts = alertCount + bottleAlertCount;
```

En el array `stats` (línea ~48), cambiar el valor de "Alertas de stock" a `totalAlerts`.

- [ ] **Step 3: Verificar lint + build**

Run: `pnpm lint && pnpm build`
Expected: Build exitoso.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "feat(dashboard): contador de alertas incluye reposición de botella"
```

---

## Task 10: Campo de umbral de alerta en el formulario de producto

**Files:**
- Modify: `src/components/products/product-form.tsx`
- Modify: `src/app/api/products/route.ts`
- Modify: `src/app/api/products/[id]/route.ts`
- Modify: `src/app/(dashboard)/productos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `BOTTLE_LEVELS`, `BottleLevel`, `isBottleLevel` de `src/lib/bottle.ts`.
- Produces: productos de cócteles pueden configurar `alertBottleLevel`; las APIs lo persisten.

- [ ] **Step 1: API POST acepta `alertBottleLevel`**

En `src/app/api/products/route.ts`, extender el tipo del body y el `data`:

```typescript
  const body = await req.json() as {
    name?: string;
    categoryId?: string;
    unit?: string;
    minStock?: number;
    imageUrl?: string;
    alertBottleLevel?: string | null;
  };
```

Añadir import: `import { isBottleLevel } from "@/lib/bottle";` y en `data` del create:

```typescript
      alertBottleLevel: isBottleLevel(body.alertBottleLevel) ? body.alertBottleLevel : null,
```

- [ ] **Step 2: API PATCH acepta `alertBottleLevel`**

En `src/app/api/products/[id]/route.ts`, extender el body y el `data` (estilo spread condicional existente):

```typescript
    alertBottleLevel?: string | null;
```

Import `import { isBottleLevel } from "@/lib/bottle";` y en `data`:

```typescript
      ...(body.alertBottleLevel !== undefined && { alertBottleLevel: isBottleLevel(body.alertBottleLevel) ? body.alertBottleLevel : null }),
```

- [ ] **Step 3: Pasar `alertBottleLevel` y slug de subcategoría al form (editar)**

En `src/app/(dashboard)/productos/[id]/editar/page.tsx`, la consulta `product` ya trae todo (findUnique sin select). Pasar a `initialData`:

```tsx
          initialData={{
            id: product.id,
            name: product.name,
            categoryId: product.categoryId,
            unit: product.unit,
            minStock: product.minStock,
            imageUrl: product.imageUrl,
            alertBottleLevel: product.alertBottleLevel,
          }}
```

- [ ] **Step 4: Form muestra el selector de umbral cuando la categoría es de cócteles**

En `src/components/products/product-form.tsx`:

Extender `Category` y `initialData`:

```typescript
interface Category {
  id: string;
  name: string;
  slug?: string | null;
  children?: { id: string; name: string; slug?: string | null }[];
}
```

Añadir a `ProductFormProps.initialData` el campo `alertBottleLevel?: string | null;`.

Añadir imports:

```typescript
import { BOTTLE_LEVELS, isBottleLevel, isBottleTrackedSlug, type BottleLevel } from "@/lib/bottle";
```

Añadir estado:

```typescript
  const [alertBottleLevel, setAlertBottleLevel] = useState<string>(
    isBottleLevel(initialData?.alertBottleLevel) ? initialData!.alertBottleLevel! : "__default__"
  );
```

Calcular si la categoría seleccionada es de cócteles (resolviendo el slug de la subcategoría elegida):

```typescript
  const selectedSlug = (() => {
    for (const cat of categories) {
      if (cat.id === categoryId) return cat.slug ?? null;
      const sub = cat.children?.find((c) => c.id === categoryId);
      if (sub) return sub.slug ?? null;
    }
    return null;
  })();
  const showBottleAlert = isBottleTrackedSlug(selectedSlug);
```

Incluir `alertBottleLevel` en el `payload` de `handleSubmit`:

```typescript
      alertBottleLevel: showBottleAlert && alertBottleLevel !== "__default__" ? alertBottleLevel : null,
```

Renderizar el selector tras el bloque de "Stock mínimo" (línea ~154):

```tsx
      {showBottleAlert && (
        <div className="space-y-1.5">
          <Label>Alertar cuando la botella esté en</Label>
          <Select value={alertBottleLevel} onValueChange={setAlertBottleLevel}>
            <SelectTrigger>
              <SelectValue placeholder="Casi vacía (por defecto)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Casi vacía (por defecto)</SelectItem>
              {BOTTLE_LEVELS.map((l) => (
                <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-400">Para licores de cócteles: nivel a partir del cual se sugiere comprar (si no hay reserva).</p>
        </div>
      )}
```

- [ ] **Step 5: Pasar slug en las categorías de los formularios (nuevo y editar)**

En `src/app/(dashboard)/productos/[id]/editar/page.tsx` y `src/app/(dashboard)/productos/nuevo/page.tsx`, las consultas de categorías deben traer `slug` de raíz e hijos. Cambiar el `include`/`select` de categorías en ambos:

```typescript
    prisma.category.findMany({
      where: { active: true, parentId: null },
      orderBy: { name: "asc" },
      include: { children: { where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }, },
    }),
```

> Nota: `include.children` con `select` interno trae solo esos campos del hijo; la raíz necesita `slug` también — usar en su lugar `select` completo o añadir `slug` a la raíz. Para la raíz, como se usa `include`, el slug de la raíz ya viene por defecto (todos los campos escalares). Verificar que `cat.slug` esté disponible; si no, cambiar a `select: { id: true, name: true, slug: true, children: {...} }`.

- [ ] **Step 6: Verificar lint + build**

Run: `pnpm lint && pnpm build`
Expected: Build exitoso.

- [ ] **Step 7: Commit**

```bash
git add src/components/products/product-form.tsx src/app/api/products/route.ts "src/app/api/products/[id]/route.ts" "src/app/(dashboard)/productos/[id]/editar/page.tsx" "src/app/(dashboard)/productos/nuevo/page.tsx"
git commit -m "feat(productos): configurar umbral de alerta de botella en cócteles"
```

---

## Task 11: Fase 2 — Carga de datos y verificación E2E

**Files:**
- (Sin cambios de código de la app. Opcional: `scripts/seed-fiori.ts` para acelerar la carga.)

**Objetivo:** Verificar el sistema completo con los productos reales del restaurante, ejercitando todos los flujos a través de la app corriendo.

- [ ] **Step 1: Levantar la app**

Run: `pnpm dev`
Expected: App en `http://localhost:3001`. Login standalone con `admin` / `admin123`.

- [ ] **Step 2: Crear estructura de categorías**

Crear (vía UI de Admin → Categorías, una por una) las categorías raíz y subcategorías. Verificar que la subcategoría **Cócteles** genere slug `cocteles`:
- **Barra** → Licores, Gaseosas, Vinos, **Cócteles**, Pulpas.
- **Cocina** → Postres, Platos de Nevera, Importados, Congelador Blanco, Congelador #1, Congelador #2, Congelados Desayunos.

Verificar el slug con: `npx prisma studio` (tabla Category) o consulta directa. La subcategoría "Cócteles" debe tener `slug = "cocteles"` (slugify de "Cócteles" = "cocteles"). **Si el slug resultara distinto, ajustar `BOTTLE_TRACKING_SLUGS` en `src/lib/bottle.ts` para que coincida, y volver a verificar.**

- [ ] **Step 3: Crear productos uno por uno con stock de prueba diferenciado**

A través del formulario "Nuevo producto", crear cada producto de los archivos `## INVENTARIO DE BARRA.txt` y `## Inventario de Cocina.txt`, asignándolos a su subcategoría. Para productos numéricos, registrar un stock inicial vía un movimiento de ENTRADA con cantidad distinta por producto. Para los de **Cócteles**, configurar (al menos en algunos) un `alertBottleLevel` distinto del default.

Verificar:
- El formulario muestra el selector "Alertar cuando la botella esté en" SOLO al elegir la subcategoría Cócteles.
- Para el resto de subcategorías, el formulario es el normal.

- [ ] **Step 4: Ejercitar movimientos (productos numéricos)**

Registrar ENTRADAS y SALIDAS para varios productos de Licores/Gaseosas/Cocina. Verificar que `currentStock` cambia y aparecen en el historial de movimientos.

- [ ] **Step 5: Inventario diario de Barra — abrir**

Abrir el inventario diario de Barra. Verificar:
- Bloques Licores/Gaseosas/Vinos/Pulpas con inputs numéricos.
- Bloque Cócteles con selector de nivel + contador de reserva y botón "Mantener igual".
- Registrar niveles y reservas distintos por licor; conteos numéricos en los demás. Iniciar la jornada.
- Confirmar (Prisma Studio) que los `DailyInventoryItem` de cócteles tienen `bottleLevel`/`reserveBottles` y `initialCount = 0`, y que NO se crearon `StockMovement` para esos productos.

- [ ] **Step 6: Inventario diario de Barra — cerrar**

Cerrar la jornada. Verificar:
- Los licores guardan su snapshot y `Product.bottleLevel`/`reserveBottles` se actualizan.
- Los numéricos generan los movimientos/ajustes habituales.
- Ningún `StockMovement` con `source` se creó para los productos de cócteles.

- [ ] **Step 7: Botón "Mantener igual"**

Abrir el inventario de Barra de un día siguiente. Pulsar "Mantener igual" en Cócteles → debe copiar los niveles/reservas del último cierre. Cerrar. Verificar que el snapshot coincide con el anterior.

- [ ] **Step 8: Reabrir inventario y editar**

Reabrir un inventario cerrado (con justificación). Verificar que se pueden editar tanto conteos numéricos como niveles de botella, y que al cerrar de nuevo los valores se actualizan sin duplicar movimientos.

- [ ] **Step 9: Verificar alertas**

Configurar un licor de cócteles con nivel ≤ su umbral y reserva 0 → debe aparecer en Alertas ("Casi vacía, sin reserva → comprar") y sumar al contador del dashboard. Añadir reserva ≥1 al mismo licor (vía nuevo inventario) → debe DESAPARECER de las alertas. Verificar también que un licor lleno no alerta.

- [ ] **Step 10: No-regresión Cocina**

Abrir, registrar y cerrar el inventario diario de Cocina (100% numérico). Verificar que funciona igual que antes (sin bloques de botella).

- [ ] **Step 11: Verificación final de build y lint**

Run: `pnpm lint && pnpm build`
Expected: Ambos pasan sin errores.

- [ ] **Step 12: Commit final (si hubo ajustes) y resumen**

```bash
git add -A && git status   # revisar que solo se commitea lo del feature
git commit -m "test(e2e): carga de datos Fiori y verificación de control de botella"
```

> Si el slug de Cócteles requirió ajustar `BOTTLE_TRACKING_SLUGS`, ese cambio queda incluido aquí.

---

## Self-Review (cobertura del spec)

- **Modelo de datos** (Product + DailyInventoryItem) → Task 2. ✅
- **Detección por slug `cocteles`** → Task 1 (`isBottleTrackedSlug`, `BOTTLE_TRACKING_SLUGS`). ✅
- **Niveles semáforo de 5 estados** → Task 1 (`BOTTLE_LEVELS`) + Task 3 (selector). ✅
- **Umbral configurable por licor + default almost_empty** → Task 1 (`DEFAULT_ALERT_LEVEL`, `needsRestock`) + Task 10 (form/API). ✅
- **Regla de alerta (nivel ≤ umbral && reserva 0)** → Task 1 (`needsRestock`) + Task 8 + Task 9. ✅
- **Backend abrir sin tocar stock** → Task 4. ✅
- **Backend cerrar guardando snapshot sin StockMovement** → Task 5. ✅
- **UI mixta dentro de Barra** → Task 6 (datos) + Task 7 (render). ✅
- **Botón "Mantener igual" (abrir y cerrar)** → Task 7 (`keepSameBottles` en CreateView y OpenView). ✅
- **Alertas en página + dashboard** → Task 8 + Task 9. ✅
- **Fase 2 testing E2E + carga de productos** → Task 11. ✅
- **No-regresión productos numéricos** → preservado en Tasks 4/5/7 (ramas separadas) + verificado en Task 11 Step 10. ✅

Riesgos cubiertos: `initialCount` no nulo → `0` para botella (Task 4 Step 5); cálculos UI saltan botella (Task 7 Steps 3-5); slug verificado y ajustable (Task 11 Step 2).
