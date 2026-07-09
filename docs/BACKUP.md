# Backups de base de datos — Inventory Xpress (per-cliente)

Todos los despliegues salen de un solo código base (`main`); cada cliente tiene
su **propia base Turso**. Los backups son **por cliente**: un workflow de GitHub
Actions vuelca, **prueba**, cifra y archiva cada base de la lista `DB_TARGETS`.

Replica el sistema probado de Nómina Xpress y añade una **prueba de integridad
automática por corrida** y un **chequeo cruzado** con `clients/registry.json`.

## Cómo funciona

El workflow [`backup-db.yml`](../.github/workflows/backup-db.yml) corre cada
**domingo a las 03:00 UTC** (o manualmente desde **Actions → Weekly DB Backup →
Run workflow**).

1. **Preflight** ([`backup-preflight.mjs`](../scripts/backup-preflight.mjs)):
   verifica que todo cliente `active` de `clients/registry.json` esté en
   `DB_TARGETS`. Si falta alguno, falla temprano.
2. Por cada cliente en `DB_TARGETS`:
   1. Vuelca la base con [`db-dump.mjs`](../scripts/db-dump.mjs) (solo lectura,
      vía `@libsql/client`) a `backup-<cliente>-<fecha>.sql`.
   2. **Prueba de integridad** con [`db-verify.mjs`](../scripts/db-verify.mjs):
      restaura el dump en una base local temporal y compara los conteos reales
      contra los esperados (embebidos en el dump). Si no cuadra, falla.
   3. Lo cifra con GPG / AES-256 usando `BACKUP_GPG_PASSPHRASE`.
   4. Borra el `.sql` en claro.
3. Sube todos los `.gpg` como un artefacto con retención de **180 días (~6 meses)**.
4. Si **cualquier** paso falla (dump, prueba o cifrado), el job `notify-failure`
   abre un **issue de GitHub** con el detalle.

## Secrets requeridos (GitHub → Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|-------|
| `DB_TARGETS` | **JSON array** con una entrada por cliente: `[{ "name": "<slug>", "url": "libsql://...", "token": "..." }]` |
| `BACKUP_GPG_PASSPHRASE` | Passphrase para cifrar/descifrar los backups |

Ejemplo de `DB_TARGETS` (una línea; incluye demo y cada cliente). El `name` debe
coincidir con el `slug` de `clients/registry.json`:

```json
[
  { "name": "demo",             "url": "libsql://inventory-xpress-demo-...turso.io", "token": "eyJ..." },
  { "name": "cucina-dei-fiori", "url": "libsql://inventory-fiori-...turso.io",       "token": "eyJ..." }
]
```

> Los tokens quedan enmascarados en los logs (`::add-mask::`). Nunca se
> hardcodean: los scripts los leen solo de variables de entorno.

## ⚠️ Requisito para que la retención llegue a 180 días

GitHub **limita** la retención de artefactos al máximo del repositorio (por
defecto **90 días**). Como el repo es **privado**, se puede subir hasta 400 días.
Para obtener los 180:

**GitHub → Settings → Actions → General → Artifact and log retention** → subir a
**≥ 180 días** y guardar. Sin esto, `retention-days: 180` se recorta al máximo del
repo (el workflow no falla, pero solo retiene lo que el repo permita).

## Genera la passphrase GPG

```bash
openssl rand -base64 32
```

Guárdala en un gestor de contraseñas; **sin ella el backup cifrado es
irrecuperable**.

## Agregar un cliente nuevo al backup

1. Añade su entrada `{ "name", "url", "token" }` al secret `DB_TARGETS` (el
   `name` = `slug` del registro).
2. Asegúrate de que el cliente esté en `clients/registry.json` con `active: true`.

El preflight verifica que ambos estén sincronizados; el próximo run lo respalda.

---

## Restaurar un backup

### 1. Descargar el artefacto

GitHub: **Actions → Weekly DB Backup → [ejecución] → Artifacts → turso-backups-XXX**.
Descarga y elige el archivo del cliente: `backup-<cliente>-YYYY-MM-DD.sql.gpg`.

### 2. Descifrar

```bash
gpg --batch --passphrase "TU_PASSPHRASE" \
    --decrypt backup-cucina-dei-fiori-YYYY-MM-DD.sql.gpg \
    --output backup-cucina-dei-fiori-YYYY-MM-DD.sql
```

### 3. Restaurar

> ⚠️ El dump ejecuta `DROP TABLE IF EXISTS` + `CREATE`: **sobrescribe** la base
> destino. Restaura primero en una base **nueva/temporal**, verifica, y solo
> entonces apunta el cliente a ella (cambiando su `TURSO_*` en Vercel).

```bash
RESTORE_URL="libsql://<base-destino>...turso.io" \
RESTORE_TOKEN="<token-destino>" \
RESTORE_CONFIRM=si \
  node scripts/db-restore.mjs backup-cucina-dei-fiori-YYYY-MM-DD.sql
```

Alternativa con Turso CLI: `turso db shell "<url-destino>" < backup-....sql`.

### 4. Verificar sin tocar producción

Restaura en una base **local** para inspeccionar sin riesgo:

```bash
RESTORE_URL="file:./verify.db" RESTORE_CONFIRM=si \
  node scripts/db-restore.mjs backup-cucina-dei-fiori-YYYY-MM-DD.sql
```

El header del dump (`-- Tabla: X (N filas)`) indica los conteos esperados por tabla.

---

## Prueba de integridad automática

En cada corrida, [`db-verify.mjs`](../scripts/db-verify.mjs) restaura cada dump en
una base local temporal y compara **conteo real vs. esperado por tabla** (los
esperados vienen embebidos en los comentarios `-- Tabla: X (N filas)` del dump).
Si el SQL no es restaurable o algún conteo no cuadra, el run falla y se abre el
issue de alerta. Esto prueba, sin tocar producción, que cada backup es realmente
restaurable y completo — no solo que el archivo se generó.

Para correr la prueba manualmente sobre un dump en claro:

```bash
node scripts/db-verify.mjs backup-<cliente>-YYYY-MM-DD.sql
```
