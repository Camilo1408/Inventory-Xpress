# Inventory Xpress

Sistema web de gestión de inventario para **cualquier negocio** que necesite controlar
el stock de sus insumos o productos (tiendas, bodegas, minimercados, farmacias, bares,
restaurantes, cafeterías, etc.). Organiza los productos en **categorías configurables**,
registra movimientos (entradas, salidas y ajustes), gestiona el inventario diario por
categoría, genera alertas de reposición y reportes por período. Funciona en modo
**standalone** (con su propia autenticación) o **integrado** con Nómina Xpress
(compartiendo el JWT de sesión).

Se distribuye como SaaS por instancia: **un solo código base en `main`**; cada cliente
tiene su propia base de datos Turso, su proyecto Vercel y su dominio. La diferencia
entre clientes es **configuración** (variables de entorno + `clients/registry.json`),
no código.

## Arranque rápido (desarrollo local)

Requisitos: Node 20+, [pnpm](https://pnpm.io).

```bash
pnpm install                      # instalar dependencias
cp .env.example .env              # configurar variables (ver .env.example)
npx prisma generate               # generar el cliente Prisma
npx prisma db push                # crear el esquema en la BD local (SQLite)
pnpm seed                         # datos iniciales: categorías + usuarios demo
pnpm dev                          # servidor de desarrollo en http://localhost:3001
```

### Credenciales demo (modo standalone)

| Rol | Usuario | Contraseña | Acceso |
|-----|---------|-----------|--------|
| SUPERADMIN | `superadmin` | `superadmin123` | Acceso completo |
| ADMIN | `admin` | `admin123` | Todo excepto crear/editar productos y categorías, y gestión de usuarios |
| EMPLOYEE | `empleado` | `empleado123` | Inventario diario, movimientos, ver productos/alertas, dashboard |

## Comandos

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Servidor de desarrollo (localhost:3001) |
| `pnpm build` | Build de producción (`prisma generate` + `next build`) |
| `pnpm start` | Servir el build de producción |
| `pnpm lint` | ESLint |
| `pnpm seed` | Datos iniciales (categorías + usuarios demo) |
| `npx prisma generate` | Regenerar el cliente Prisma tras cambios de schema |
| `npx prisma db push` | Aplicar el schema a la BD local |

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui ·
Prisma 7 · SQLite (local) / Turso (producción) · NextAuth v5 · Vercel Blob.

## Documentación

| Documento | Para quién | Contenido |
|-----------|-----------|-----------|
| [DOCUMENTACION_COMPLETA_DEL_PROYECTO.md](DOCUMENTACION_COMPLETA_DEL_PROYECTO.md) | Desarrolladores / mantenedores | Arquitectura, base de datos, módulos, permisos, reglas de negocio, despliegue, mantenimiento |
| [MANUAL_DE_USUARIO.md](MANUAL_DE_USUARIO.md) | Cliente final | Guía paso a paso de cada funcionalidad del sistema |
| [docs/README.md](docs/README.md) | Todos | Índice y mapa de toda la documentación del repositorio |

La documentación operativa (backups, releases multi-cliente, integración con Nómina)
y los registros históricos de diseño están bajo [`docs/`](docs/).

## Convenciones importantes

- **Next.js 16:** el middleware es `src/proxy.ts` (no `middleware.ts` en la raíz).
- **Prisma 7:** la URL de la BD va en `prisma.config.ts`, no en `schema.prisma`; el
  cliente se genera en `src/generated/prisma/` (no editar a mano).
- **TypeScript strict sin `any`**: el contrato del JWT compartido depende de tipos correctos.
- `currentStock` solo se modifica dentro de una transacción Prisma que también registra
  el `StockMovement` correspondiente.
