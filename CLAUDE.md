# Inventario Restaurante

Sistema web de gestión de inventario para restaurante. Controla stock de barra y cocina, registra movimientos, genera alertas y reportes. Funciona en modo standalone (auth propia) o integrado con Nomina Xpress (JWT compartido).

## Comandos

- `pnpm dev` — Servidor de desarrollo en localhost:3001
- `pnpm build` — Build de producción
- `pnpm lint` — ESLint
- `npx prisma generate` — Regenerar cliente Prisma tras cambios de schema
- `npx prisma db push` — Aplicar schema a la DB (dev local)
- `npx tsx prisma/seed.ts` — Insertar datos iniciales (categorías + usuarios demo por rol)

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

```typescript
canManageProducts(role)          // solo SUPERADMIN — crear/editar/eliminar productos y categorías
canDoStockCount(role, access)    // SUPERADMIN o inventoryAccess=true — registrar movimientos
canManageUsers(role)             // solo SUPERADMIN — gestión de usuarios (standalone)
```

Verificar permisos al inicio de cada API route antes de acceder a la DB.

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
