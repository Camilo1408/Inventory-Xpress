# Inventory Xpress

Sistema web de gestión de inventario para cualquier negocio que maneje insumos o productos (tiendas, bodegas, farmacias, bares, restaurantes, etc.). Organiza productos en categorías configurables, registra movimientos, genera alertas y reportes. Funciona en modo standalone (auth propia) o integrado con Nomina Xpress (JWT compartido). Incluye un módulo opcional de control por nivel de botella (flag `cocktails`) para productos embotellados como licores.

## Comandos

- `pnpm dev` — Servidor de desarrollo en localhost:3001
- `pnpm build` — Build de producción
- `pnpm lint` — ESLint
- `npx prisma generate` — Regenerar cliente Prisma tras cambios de schema
- `npx prisma db push` — Aplicar schema a la DB (dev local)
- `npx tsx prisma/seed.ts` — Insertar datos iniciales (categorías + usuarios demo por rol)
- `npx tsx prisma/e2e-full-suite.ts` — Batería E2E de regresión (requiere `pnpm dev` con
  `AUTH_MODE=standalone`); baterías por función en `prisma/test-*.ts`

## Credenciales demo (modo standalone)

- SUPERADMIN: superadmin / superadmin123 — acceso completo
- ADMIN: admin / admin123 — todo excepto crear/editar productos y categorías, y gestión de usuarios/roles
- EMPLOYEE: empleado / empleado123 — inventario diario, movimientos, ver productos/alertas, dashboard

## Tech Stack

Next.js 16 App Router + TypeScript strict + Tailwind CSS v4 + shadcn/ui + Prisma 7 + SQLite local / Turso (prod) + NextAuth v5 + Vercel Blob

## Arquitectura

### Modo de Autenticación (`AUTH_MODE`)

```
AUTH_MODE=standalone  → Login propio en /login, tabla User en DB local
AUTH_MODE=integrated  → Sin login, valida JWT de cookie de Nomina Xpress
```

### Next.js 16 — Convenciones importantes

- El middleware en Next.js 16 es `src/proxy.ts` (no `middleware.ts` en la raíz)
- Prisma 7 no soporta `url` en `schema.prisma` — la URL va en `prisma.config.ts`
- El cliente Prisma se inicializa con adapter y está en `src/generated/prisma/`

### Estructura de directorios

- `src/app/(auth)/` — Ruta de login (solo en standalone)
- `src/app/(dashboard)/` — Todas las rutas protegidas bajo el shell sidebar+header
- `src/app/api/` — API routes: products, categories, movements, alerts, reports, upload, admin/users
- `src/components/layout/` — sidebar.tsx, header.tsx
- `src/components/products/` — product-table.tsx, product-form.tsx, image-upload.tsx
- `src/components/movements/` — movement-form.tsx
- `src/lib/` — auth.ts, db.ts, permissions.ts, blob.ts, utils.ts
- `src/types/` — next-auth.d.ts, index.ts
- `src/generated/prisma/` — Cliente Prisma generado (no editar)
- `prisma/` — schema.prisma + seed.ts
- `prisma.config.ts` — Adaptador Prisma (URL de DB aquí, no en schema)

### Flujo de datos

- Server Components leen datos directamente con `prisma` (no fetch interno)
- Client Components usan `fetch` a API routes para mutaciones
- `currentStock` se actualiza en transacción Prisma junto con cada `StockMovement`
- `userId` y `userName` en movimientos se copian del JWT (no FK)

### Permisos

El enforcement es **granular por acción**. Todos los helpers viven en
`src/lib/permissions.ts` y reciben el objeto `session.user` (no el `role` suelto),
porque el permiso se resuelve desde `inventoryPermissions` (arreglo de claves).

```typescript
// 13 claves globales (objeto INV); cada una tiene su helper:
canCreateProducts(user)       // inventory:products:create
canEditProducts(user)         // inventory:products:edit
canDeleteProducts(user)       // inventory:products:delete       (activar/desactivar)
canHardDeleteProducts(user)   // inventory:products:hard_delete  (borrado permanente sin historial)
canManageCategories(user)     // inventory:categories:manage
canDoStockCount(user)         // inventory:stock:count           (movimientos e inventario diario)
canAdjustStock(user)          // inventory:stock:adjust          (movimientos tipo ADJUSTMENT)
canEditMovements(user)        // inventory:movements:edit        (corregir/eliminar movimientos manuales)
canReopenDailyInventory(user) // inventory:daily:reopen
canViewReports(user)          // inventory:reports:view
canViewAudit(user)            // inventory:audit:view
canManageUsers(user)          // inventory:users:manage          (solo standalone)
canAccessInventory(user)      // gate del middleware             (inventory:view)

// Permisos por categoría de inventario diario (derivados del slug de la raíz):
canDailyCategory(user, slug, action)   // action: view | open | close | edit | history
```

En **modo integrado** la clave por categoría es la fuente de verdad para los usuarios
no-admin: no hay fallback a claves globales (`inventory:stock:count` habilita
Movimientos, nunca concede categorías del inventario diario). **Excepción — roles
admin:** PROPRIETARY/SUPERADMIN/ADMIN tienen fallback por **rol** (no por clave global),
así que operan todas las categorías aun sin la clave por categoría en el JWT; con esto
una categoría raíz nueva es visible/operable sin re-login (el listado se lee en vivo de
la DB). En **standalone** —donde el catálogo local no tiene claves por categoría— se
concede por rol/clave global.

**`canEditMovements` es la excepción al fallback por rol:** concede por clave y, si no,
**solo** a PROPRIETARY/SUPERADMIN. El ADMIN depende de la clave (para que Nómina pueda
revocársela); en standalone viene en el preset de ADMIN y es revocable desde la UI de roles.
Ver `docs/nomina-spec-permiso-movements-edit.md`.

**Descartar/editar el conteo inicial de una jornada ABIERTA** se gobierna por la clave
`:edit` de la categoría (misma que "Reabrir/editar"), vía `canDailyCategory(user, slug,
"edit")` — no por un gate de rol aparte. Cualquiera con "Reabrir/editar" de la categoría
(o un rol admin, por el fallback) puede reabrir, descartar y corregir el conteo inicial.

Verificar permisos al inicio de cada API route antes de acceder a la DB. En modo
standalone los permisos efectivos se resuelven en `src/lib/roles.ts`
(`resolveUserPermissions`: rol base ∪ rol personalizado ∪ grant − revoke); en modo
integrated llegan firmados en el JWT de Nómina Xpress.

## Sistema de Diseño

### Colores

- Primary: `#2563EB` (blue-600) — botones CTA
- Background: `#F8FAFC` (slate-50)
- Surface: `#FFFFFF` — cards, panels
- Border: `#E2E8F0` (slate-200)
- Success: `#059669` (emerald-600) — stock ok
- Warning: `#D97706` (amber-600) — stock bajo
- Destructive: `#DC2626` (red-600) — sin stock, eliminar

### Badges de stock

- En stock: `bg-emerald-100 text-emerald-700`
- Bajo mínimo: `bg-amber-100 text-amber-700`
- Sin stock: `bg-red-100 text-red-700`

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `AUTH_MODE` | `standalone` o `integrated` |
| `NEXTAUTH_SECRET` | Secreto JWT — idéntico al de Nomina Xpress en modo integrated |
| `NEXTAUTH_URL` | URL base del inventario |
| `TURSO_DATABASE_URL` | URL Turso o `file:./inventario.db` en local |
| `TURSO_AUTH_TOKEN` | Token Turso (omitir en local) |
| `NOMINA_APP_URL` | URL de Nomina Xpress (server-side, para redirects) |
| `NEXT_PUBLIC_NOMINA_APP_URL` | URL de Nomina Xpress (client-side, para links) |
| `BLOB_READ_WRITE_TOKEN` | Token Vercel Blob (server-only) |

## Reglas No Negociables

1. **TypeScript strict sin `any`.** El contrato de integración depende de tipos correctos en el JWT payload.
2. **`currentStock` solo se modifica dentro de una transacción Prisma** que también crea el `StockMovement`. Nunca actualizar el stock sin registro del movimiento.
3. **No crear tabla de usuarios en modo integrated.** `userId` y `userName` en movimientos son strings copiados del JWT, no foreign keys.
4. **Verificar permisos explícitamente en cada API route** — el proxy no protege llamadas directas a `/api`.
5. **El `NEXTAUTH_SECRET` debe ser idéntico al de Nomina Xpress en modo integrated.**
6. **El logout en modo integrated redirige al endpoint de logout de Nomina Xpress.**
7. **Prisma 7**: no hay `url` en `schema.prisma`, va en `prisma.config.ts`. El cliente requiere adapter.
8. **Next.js 16**: el middleware es `src/proxy.ts`, no `middleware.ts` en la raíz.
