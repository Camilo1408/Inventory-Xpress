# Guía: Permisos granulares de inventario (cambios en este proyecto)

> ⚠️ **Documento histórico (implementado).** Esta guía describe la migración que
> ya se aplicó al inventario para leer permisos granulares del JWT de Nómina. Los
> pasos de código, tablas de call sites y checklists son un registro de cómo se
> hizo; **no** son la referencia vigente. La descripción autoritativa y actualizada
> de roles y permisos está en
> [`DOCUMENTACION_COMPLETA_DEL_PROYECTO.md`](../DOCUMENTACION_COMPLETA_DEL_PROYECTO.md)
> (§ Roles, permisos y restricciones). El contrato real hoy tiene **12 claves
> globales** (esta guía menciona 10: faltan `inventory:products:hard_delete` e
> `inventory:audit:view`, añadidas después).

> **Contexto:** Nómina Xpress (proyecto `restaurant-nomina`) ya fue actualizado. Ahora
> emite en el JWT un arreglo `inventoryPermissions: string[]` con permisos granulares
> por acción, además de `inventoryAccess: boolean`. Este proyecto (inventario) debe
> **leer y enforcing** esos permisos. **No toques el proyecto de nómina** — todo lo de
> nómina ya está hecho. Aquí solo se cambia el inventario.

---

## 1. Qué cambió en Nómina (ya hecho — solo para tu contexto)

El JWT que comparten ambas apps ahora incluye:

```typescript
interface NominaJWTPayload {
  sub: string
  username: string
  role: "PROPRIETARY" | "SUPERADMIN" | "ADMIN" | "EMPLOYEE"   // ← PROPRIETARY es nuevo
  tenantId: string
  inventoryAccess: boolean        // true si tiene ≥1 permiso de inventario
  inventoryPermissions: string[]  // ← NUEVO: permisos granulares por acción
  iat: number
  exp: number
}
```

**Valores de `inventoryPermissions` según el usuario:**

| Usuario / rol | inventoryAccess | inventoryPermissions |
|---|:---:|---|
| PROPRIETARY | `true` | los 10 (control total) |
| SUPERADMIN | `true` | los 10 |
| ADMIN | `true` | los 10 |
| EMPLOYEE con toggle de inventario | `true` | `["inventory:view","inventory:stock:count"]` |
| EMPLOYEE sin toggle | `false` | `[]` |
| Rol personalizado | depende | el subconjunto que el admin le asignó |

**Las claves de permiso globales (contrato fijo).** Nota: esta guía se escribió con
10 claves; el contrato vigente son **12** (se añadieron `inventory:products:hard_delete`
e `inventory:audit:view`):

```
inventory:view                 → acceder al inventario (gate de entrada)
inventory:products:create      → crear productos
inventory:products:edit        → editar productos
inventory:products:delete      → activar/desactivar productos
inventory:products:hard_delete → borrado permanente de productos sin historial   (añadida)
inventory:categories:manage    → crear/editar categorías
inventory:stock:count          → registrar movimientos / inventario diario
inventory:stock:adjust         → ajustes manuales de stock (tipo ADJUSTMENT)
inventory:daily:reopen         → reabrir inventario diario cerrado
inventory:reports:view         → ver reportes de inventario
inventory:audit:view           → ver el módulo de auditoría                       (añadida)
inventory:users:manage         → gestionar usuarios del inventario (modo standalone)
```

> **Importante:** El usuario debe **cerrar sesión y volver a iniciar** en nómina para
> que el JWT incluya estos campos nuevos (el JWT se genera en el login).

---

## 2. Cambios en este proyecto (paso a paso)

### Paso 1 — Tipos de sesión

**Archivo:** busca dónde se declaran los tipos de NextAuth (típicamente
`src/types/next-auth.d.ts`). Agrega `inventoryPermissions`:

```typescript
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string
      role: string
      tenantId: string
      inventoryAccess: boolean
      inventoryPermissions: string[]   // ← NUEVO
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string
    username: string
    tenantId: string
    inventoryAccess: boolean
    inventoryPermissions?: string[]    // ← NUEVO
  }
}
```

### Paso 2 — Leer el permiso en el callback de sesión

**Archivo:** `src/lib/auth.config.ts`

```typescript
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.role = (user as { role: string }).role;
      token.username = (user as { username: string }).username;
      token.inventoryAccess = (user as { inventoryAccess: boolean }).inventoryAccess;
      token.tenantId = (user as { tenantId: string }).tenantId;
      // ← NUEVO: pasar el arreglo tal cual viene del JWT de nómina
      token.inventoryPermissions = (user as { inventoryPermissions?: string[] }).inventoryPermissions ?? [];
    }
    return token;
  },
  async session({ session, token }) {
    session.user.id = token.sub as string;
    session.user.username = token.username as string;
    session.user.role = token.role as string;
    session.user.tenantId = token.tenantId as string;
    session.user.inventoryAccess = (token.inventoryAccess as boolean) ?? false;
    // ← NUEVO
    session.user.inventoryPermissions = (token.inventoryPermissions as string[]) ?? [];
    return session;
  },
},
```

> **Nota:** En el flujo cross-app, `user` no siempre está presente (el JWT viene
> de nómina). Si tu callback `jwt` no recibe `user`, el `token` ya trae
> `inventoryPermissions` porque nómina lo firmó. En ese caso el `session` callback
> simplemente lo lee de `token` (como arriba). No necesitas el bloque `if (user)`
> para este campo si el token ya lo trae firmado por nómina.

### Paso 3 — Reescribir `src/lib/permissions.ts`

Reemplaza **todo** el archivo por esta versión basada en permisos granulares.
Mantiene los **mismos nombres de funciones** para no romper los ~15 call sites, pero
ahora reciben la `session` y revisan el permiso correspondiente. PROPRIETARY se
incluye implícitamente porque nómina ya le envía los 10 permisos.

```typescript
// src/lib/permissions.ts
// Enforcing granular basado en los permisos que envía Nómina Xpress en el JWT.

type SessionUser = {
  role: string;
  inventoryAccess: boolean;
  inventoryPermissions?: string[];
};

/** Claves de permiso del módulo de inventario (contrato con Nómina Xpress). */
export const INV = {
  VIEW: "inventory:view",
  PRODUCTS_CREATE: "inventory:products:create",
  PRODUCTS_EDIT: "inventory:products:edit",
  PRODUCTS_DELETE: "inventory:products:delete",
  CATEGORIES_MANAGE: "inventory:categories:manage",
  STOCK_COUNT: "inventory:stock:count",
  STOCK_ADJUST: "inventory:stock:adjust",
  DAILY_REOPEN: "inventory:daily:reopen",
  REPORTS_VIEW: "inventory:reports:view",
  USERS_MANAGE: "inventory:users:manage",
} as const;

/** Verificación base: ¿el usuario tiene este permiso granular? */
export function can(user: SessionUser | undefined | null, key: string): boolean {
  if (!user) return false;
  const perms = user.inventoryPermissions ?? [];
  if (perms.includes(key)) return true;
  // Fallback de compatibilidad: si por alguna razón el JWT viejo no trae
  // inventoryPermissions pero sí inventoryAccess, concede el baseline operativo.
  if ((perms.length === 0) && user.inventoryAccess) {
    return key === INV.VIEW || key === INV.STOCK_COUNT;
  }
  return false;
}

/** ¿Puede acceder al inventario? (gate del middleware) */
export function canAccessInventory(user: SessionUser): boolean {
  return user.inventoryAccess === true || (user.inventoryPermissions?.length ?? 0) > 0;
}

/** Crear productos. */
export function canCreateProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_CREATE);
}

/** Editar productos. */
export function canEditProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_EDIT);
}

/** Eliminar/desactivar productos. */
export function canDeleteProducts(user: SessionUser): boolean {
  return can(user, INV.PRODUCTS_DELETE);
}

/** Gestionar categorías. */
export function canManageCategories(user: SessionUser): boolean {
  return can(user, INV.CATEGORIES_MANAGE);
}

/** Registrar movimientos / inventario diario. */
export function canDoStockCount(user: SessionUser): boolean {
  return can(user, INV.STOCK_COUNT);
}

/** Ajustes manuales de stock (tipo ADJUSTMENT). */
export function canAdjustStock(user: SessionUser): boolean {
  return can(user, INV.STOCK_ADJUST);
}

/** Reabrir inventario diario cerrado. */
export function canReopenDailyInventory(user: SessionUser): boolean {
  return can(user, INV.DAILY_REOPEN);
}

/** Ver reportes de inventario. */
export function canViewReports(user: SessionUser): boolean {
  return can(user, INV.REPORTS_VIEW);
}

/** Gestionar usuarios del inventario (solo modo standalone). */
export function canManageUsers(user: SessionUser): boolean {
  return can(user, INV.USERS_MANAGE);
}
```

> **Decisión de diseño:** las funciones ahora reciben el objeto `session.user`
> completo (no `role` suelto), porque el permiso vive en `inventoryPermissions`.
> Esto obliga a actualizar los call sites (Paso 5), pero es lo que permite la
> granularidad que pediste.

### Paso 4 — `src/proxy.ts` (middleware)

Reemplaza la condición de denegación por la verificación de acceso. Esto deja
entrar a PROPRIETARY automáticamente (porque nómina ya le pone `inventoryAccess=true`):

```typescript
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { canAccessInventory } from "@/lib/permissions";

const { auth } = NextAuth(authConfig);
const isStandalone = process.env.AUTH_MODE === "standalone";

export default auth((req) => {
  const session = req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/unauthorized")) return;
  if (isStandalone && pathname.startsWith("/login")) return;

  if (!session) {
    if (isStandalone) return Response.redirect(new URL("/login", req.url));
    const loginUrl = new URL(`${process.env.NOMINA_APP_URL}/login`);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return Response.redirect(loginUrl);
  }

  // ← Antes: chequeaba role SUPERADMIN/ADMIN + inventoryAccess (sin PROPRIETARY).
  //   Ahora: un único gate por acceso efectivo.
  if (!canAccessInventory(session.user)) {
    return Response.redirect(new URL("/unauthorized", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### Paso 5 — Actualizar los call sites

Las firmas de los helpers cambiaron de `(role)` / `(role, inventoryAccess)` a
`(session.user)`. Actualiza cada uso según esta tabla. **Recuerda actualizar
también el `import`** (algunos nombres de función cambiaron).

| Archivo | Antes | Ahora |
|---|---|---|
| `app/(dashboard)/admin/categorias/page.tsx` | `canManageProducts(session.user.role)` | `canManageCategories(session.user)` |
| `app/(dashboard)/admin/usuarios/page.tsx` | `canManageUsers(session.user.role)` | `canManageUsers(session.user)` |
| `app/(dashboard)/inventario-diario/page.tsx` | `canDoStockCount(session.user.role, session.user.inventoryAccess)` | `canDoStockCount(session.user)` |
| `app/(dashboard)/inventario-diario/page.tsx` | `canReopenDailyInventory(session.user.role)` | `canReopenDailyInventory(session.user)` |
| `app/(dashboard)/movimientos/page.tsx` | `canManageProducts(session.user.role)` (canAdjust) | `canAdjustStock(session.user)` |
| `app/(dashboard)/productos/nuevo/page.tsx` | `canManageProducts(session.user.role)` | `canCreateProducts(session.user)` |
| `app/(dashboard)/productos/page.tsx` | `canManageProducts(session.user.role)` (canManage) | `canEditProducts(session.user)` *(ver nota)* |
| `app/(dashboard)/productos/[id]/editar/page.tsx` | `canManageProducts(session.user.role)` | `canEditProducts(session.user)` |
| `api/admin/users/route.ts` | `canManageUsers(session.user.role)` | `canManageUsers(session.user)` |
| `api/admin/users/[id]/route.ts` | `canManageUsers(session.user.role)` | `canManageUsers(session.user)` |
| `api/categories/route.ts` | `canManageProducts(session.user.role)` | `canManageCategories(session.user)` |
| `api/categories/[id]/route.ts` | `canManageProducts(session.user.role)` | `canManageCategories(session.user)` |
| `api/daily-inventory/route.ts` | `canDoStockCount(session.user.role, session.user.inventoryAccess)` | `canDoStockCount(session.user)` |
| `api/daily-inventory/[id]/route.ts` | `canDoStockCount(...)` y `canReopenDailyInventory(role)` | `canDoStockCount(session.user)` y `canReopenDailyInventory(session.user)` |
| `api/movements/route.ts` | `canDoStockCount(session.user.role, session.user.inventoryAccess)` | `canDoStockCount(session.user)` — y si el movimiento es `ADJUSTMENT`, exige además `canAdjustStock(session.user)` |
| `api/products/route.ts` (POST) | `canManageProducts(session.user.role)` | `canCreateProducts(session.user)` |
| `api/products/[id]/route.ts` (PUT) | `canManageProducts(session.user.role)` | `canEditProducts(session.user)` |
| `api/products/[id]/route.ts` (DELETE) | `canManageProducts(session.user.role)` | `canDeleteProducts(session.user)` |

> **Nota productos/page.tsx:** esa página usa un solo flag `canManage` para mostrar
> botones de crear/editar/eliminar. Si quieres granularidad fina en la UI, expón tres
> flags (`canCreate`, `canEdit`, `canDelete`) y condiciona cada botón. Si prefieres
> simplicidad, usa `canEditProducts(session.user)` como flag general de "gestiona".

> **Nota movimientos (ADJUSTMENT):** en `api/movements/route.ts`, lee el `type` del
> body. Para `ENTRY`/`EXIT` basta `canDoStockCount`. Para `ADJUSTMENT` exige
> `canAdjustStock`. Ejemplo:
> ```typescript
> if (!canDoStockCount(session.user)) return NextResponse.json({error:"..."},{status:403});
> if (body.type === "ADJUSTMENT" && !canAdjustStock(session.user))
>   return NextResponse.json({error:"Sin permiso para ajustes"},{status:403});
> ```

### Paso 6 — Reportes (si la página de reportes no tiene gate)

Si `app/(dashboard)/reportes/page.tsx` no valida permiso, agrégalo:

```typescript
import { canViewReports } from "@/lib/permissions";
// ...
if (!canViewReports(session.user)) redirect("/");
```

---

## 3. Verificación

Con ambos proyectos corriendo (`nómina :3000`, `inventario :3001`) y tras
**re-loguear** en nómina:

1. **PROPRIETARY (SadminJavier / Javier123)** → entra al inventario y puede crear/editar/eliminar productos, categorías, movimientos, ajustes, reabrir inventario, reportes y usuarios.
2. **SUPERADMIN (SadminMajo / Majo123)** y **ADMIN (AdminValen / Valen123)** → igual que PROPRIETARY (control total).
3. **EMPLOYEE con toggle (CesarH / CesarH123)** → entra, puede registrar conteo (`stock:count`) y ver dashboard, pero **no** crear productos ni reabrir inventario.
4. **EMPLOYEE sin toggle (Vanessa / Vanessa123)** → `/unauthorized`.
5. **Rol personalizado:** crea en nómina un rol con solo `inventory:view` + `inventory:stock:count`, asígnalo a un usuario ADMIN, re-loguea → debe comportarse como el empleado operativo (sin gestión de productos).

> Para inspeccionar el JWT en el inventario, imprime temporalmente
> `console.log(session.user.inventoryPermissions)` en una página server.

---

## 4. Checklist

- [ ] `src/types/next-auth.d.ts` — agregar `inventoryPermissions`
- [ ] `src/lib/auth.config.ts` — leer `inventoryPermissions` en jwt+session
- [ ] `src/lib/permissions.ts` — reemplazar por la versión granular
- [ ] `src/proxy.ts` — usar `canAccessInventory`
- [ ] Actualizar los ~18 call sites (tabla del Paso 5) + sus imports
- [ ] (Opcional) gate de reportes
- [ ] `npm run build` sin errores de tipos
- [ ] Verificar los 5 escenarios de la sección 3

## 5. Reglas de oro

- **No modificar el proyecto de nómina.** Ya quedó listo.
- **`NEXTAUTH_SECRET` idéntico** en ambos proyectos (sin cambios).
- Los cambios de permisos requieren **re-login** para reflejarse (el JWT se firma al iniciar sesión).
- El fallback en `can()` mantiene compatibilidad con sesiones viejas hasta que el usuario re-loguee.
