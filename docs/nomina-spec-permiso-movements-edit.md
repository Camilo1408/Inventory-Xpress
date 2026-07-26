# Spec para Nómina Xpress: clave de permiso `inventory:movements:edit`

**Fecha:** 2026-07-26 · **Origen:** Inventory Xpress (PR de corrección de movimientos)
**Estado:** pendiente de implementar en el repo de Nómina Xpress.

## Contexto

Inventory Xpress incorporó la corrección de movimientos manuales: editar cantidad/notas
o eliminar un movimiento (ENTRY/EXIT/ADJUSTMENT con `source = null`), revirtiendo su
efecto en stock dentro de una transacción y dejando rastro en auditoría
(`movement.edit` / `movement.delete`).

La función está gobernada por la clave granular:

```
inventory:movements:edit
```

### Cómo la resuelve el inventario (ya desplegado)

- `canEditMovements(user)` en `src/lib/permissions.ts` del inventario:
  1. Si `inventoryPermissions` (JWT) contiene la clave → **concedido**.
  2. Fallback por rol **solo** para `PROPRIETARY` y `SUPERADMIN` → concedido siempre.
  3. `ADMIN` y demás roles **sin fallback**: dependen de la clave en el JWT.
- Esto es deliberado: permite **revocarle la función al ADMIN** desde Nómina
  (a diferencia del fallback admin general de las categorías del inventario diario).
- En modo standalone la clave ya existe en el catálogo local (`src/lib/roles.ts`),
  incluida por defecto en el preset de ADMIN y revocable desde la UI de roles local.

## Cambios requeridos en Nómina Xpress

1. **Catálogo de permisos.** Añadir la clave al catálogo de permisos del módulo de
   inventario que Nómina administra (junto a `inventory:stock:adjust`,
   `inventory:daily:reopen`, etc.):
   - **Clave:** `inventory:movements:edit`
   - **Etiqueta sugerida:** "Corregir movimientos"
   - **Descripción sugerida:** "Editar cantidad/notas o eliminar movimientos manuales
     ya registrados en el inventario (entradas, salidas y ajustes)."
   - **Grupo:** Operación (o el equivalente en el catálogo de Nómina).

2. **Presets de rol.** Incluirla **por defecto** en el preset del rol `ADMIN`
   (y en `PROPRIETARY`/`SUPERADMIN` si sus presets son explícitos, aunque para esos
   dos el inventario concede por rol de todos modos). Debe poder revocarse por
   usuario o por rol desde la UI de permisos de Nómina, igual que cualquier otra
   clave granular.

3. **Emisión en el JWT.** Verificar que la clave viaje en el arreglo
   `inventoryPermissions` del JWT compartido tras el siguiente login del usuario.
   No hay cambios de formato: es una clave más en el mismo arreglo.

## Comportamiento transitorio (hasta implementar esto)

En Fiori (modo integrated):
- `PROPRIETARY` y `SUPERADMIN` ya ven y usan "Corregir movimientos" (fallback por rol).
- `ADMIN` **no** ve la función (la clave no viene en su JWT). No es un bug: queda
  habilitada automáticamente cuando Nómina emita la clave y el admin re-loguee.

## Verificación sugerida al implementar

1. Login como ADMIN en Fiori → en `/movimientos/historial` deben aparecer los íconos
   de lápiz/papelera en los movimientos manuales.
2. Revocar la clave a ese ADMIN desde Nómina → tras re-login, los íconos desaparecen
   y la API responde 403 a `PATCH/DELETE /api/movements/[id]`.
3. Un `EMPLOYEE` nunca debe tener la función aunque tenga `inventory:stock:count`.
