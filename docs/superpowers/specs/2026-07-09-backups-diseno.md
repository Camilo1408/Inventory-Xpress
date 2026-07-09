# Diseño — Sistema de backups per-cliente (Inventory Xpress)

**Fecha:** 2026-07-09
**Estado:** Aprobado (pendiente de plan de implementación)
**Autor:** Camilo + Claude

## Objetivo

Respaldar automáticamente **cada base de datos Turso de cliente** de Inventory
Xpress, con backups **cifrados, retenidos 180 días, probados en cada corrida y
con alerta ante cualquier fallo**. Replica el sistema ya probado de Nómina Xpress
(`restaurant-nomina/.github/workflows/backup-db.yml`) y le añade una prueba de
integridad automática por corrida y un chequeo cruzado contra el registro de
clientes.

### Principio rector (heredado del modelo multi-cliente)

> Un solo código base en `main`; cada cliente tiene su propia base Turso. El
> backup es **por cliente**, aislado, y cada archivo es restaurable por separado.

### No-objetivos

- **No** es Cloudflare R2 (todavía). Se usa GitHub Actions Artifacts ahora; se
  migrará a R2 cuando crezca la cantidad de clientes. El diseño mantiene el dump
  independiente del destino para que ese cambio sea solo el paso de "subir".
- **No** point-in-time restore de Turso (feature de pago). Se usa dump SQL
  portable, restaurable en cualquier libSQL/SQLite.
- **No** se respaldan blobs de imágenes de producto (Vercel Blob) en esta
  iteración — solo las bases de datos.

## Decisiones (cerradas)

| Decisión | Valor |
|----------|-------|
| Almacenamiento | GitHub Actions Artifacts (privado, del repo) |
| Retención | 180 días |
| Formato | Dump SQL cifrado con GPG/AES-256 |
| Fuente de credenciales | Secret `DB_TARGETS` (JSON `[{name,url,token}]`), igual que Nómina |
| Programación | Cron semanal (domingo 03:00 UTC) + `workflow_dispatch` |
| Prueba de integridad | Automática, en cada corrida (nuevo respecto a Nómina) |
| Chequeo cruzado con registro | Sí (nuevo respecto a Nómina) |
| Alerta ante fallo | Issue de GitHub (creación **o** prueba) |

## Arquitectura

```
GitHub Actions  (schedule semanal + workflow_dispatch)
  │
  ├─ Chequeo cruzado: todo cliente active de clients/registry.json
  │   debe estar en DB_TARGETS  →  falla temprano si falta alguno
  │
  ├─ Por cada cliente en DB_TARGETS:
  │     1. Dump SQL solo-lectura      → backup-<name>-<fecha>.sql
  │     2. Prueba de integridad        → restaura local + compara conteos
  │     3. Cifra GPG/AES-256           → backup-<name>-<fecha>.sql.gpg
  │     4. Borra el .sql en claro
  │
  ├─ Sube todos los .gpg como artifact (retention-days: 180)
  │
  └─ Job notify-failure (if: failure(), needs: backup):
        abre un issue de GitHub con link al run y qué revisar
```

## Componentes

### 1. `scripts/db-dump.mjs` (copiado de Nómina, sin cambios)

Dump SQL **solo lectura** de una base Turso/libSQL vía `@libsql/client`. Produce
SQL estándar restaurable: `PRAGMA foreign_keys=OFF` + `BEGIN` + por tabla
(`DROP TABLE IF EXISTS` + `CREATE` + `INSERT`s) + índices + `COMMIT`. **Embebe el
conteo de filas por tabla en comentarios** (`-- Tabla: X (N filas)`), que la
prueba de integridad usará como valores esperados.

- Credenciales solo por env: `DUMP_URL`, `DUMP_TOKEN`, salida en `argv[2]`.
- Nunca modifica la base de origen (solo `SELECT`/`PRAGMA`).

Fuente idéntica: `restaurant-nomina/scripts/db-dump.mjs`.

### 2. `scripts/db-restore.mjs` (copiado de Nómina, sin cambios)

Restaura un dump en una base destino. **Destructivo** (el dump hace `DROP TABLE`),
con guarda `RESTORE_CONFIRM=si`. Credenciales por env: `RESTORE_URL`,
`RESTORE_TOKEN`. Usa `db.executeMultiple(sql)`.

Fuente idéntica: `restaurant-nomina/scripts/db-restore.mjs`.

### 3. `scripts/db-verify.mjs` (NUEVO — prueba de integridad automática)

Prueba, **sin tocar producción ni la nube**, que un dump es restaurable y
completo:

1. Lee el archivo `.sql`.
2. Parsea los conteos esperados de los comentarios `-- Tabla: <nombre> (<N> filas)`.
3. Restaura el dump en una base **local temporal** (`file:` con nombre único,
   p.ej. `file:./.verify-<name>.db`), vía `db.executeMultiple`.
4. Cuenta las filas reales de cada tabla en la base restaurada.
5. Compara real vs. esperado **por tabla** y el total.
6. Borra la base temporal.
7. Sale `0` si todo coincide; `!= 0` con `::error::` y detalle de la discrepancia
   si algo no cuadra o el SQL no es restaurable.

Interfaz: `node scripts/db-verify.mjs <archivo-dump.sql>`. Sin credenciales (todo
local). Determinista y rápido.

**Por qué comparar contra el header y no re-consultar la fuente:** el dump ya
capturó los conteos en el momento del volcado; comparar la restauración local
contra esos números prueba que el archivo produce exactamente los datos que dijo
contener — cubre corrupción, truncamiento o SQL no restaurable, sin una segunda
lectura remota.

### 4. `.github/workflows/backup-db.yml` (adaptado de Nómina)

```yaml
name: Weekly DB Backup (per-cliente) — Inventory Xpress

on:
  schedule:
    - cron: "0 3 * * 0"   # domingo 03:00 UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # este repo usa pnpm (no npm como Nómina)
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - run: pnpm install --frozen-lockfile --ignore-scripts

      # Paso 1 — Chequeo cruzado registro ↔ DB_TARGETS (NUEVO)
      - name: Verificar cobertura de clientes
        env:
          DB_TARGETS: ${{ secrets.DB_TARGETS }}
        run: node scripts/backup-preflight.mjs

      # Paso 2 — Dump + verify + cifrar por cliente
      - name: Dump, probar y cifrar cada cliente
        env:
          DB_TARGETS: ${{ secrets.DB_TARGETS }}
          PASSPHRASE: ${{ secrets.BACKUP_GPG_PASSPHRASE }}
        run: |
          set -euo pipefail
          # (falta DB_TARGETS/PASSPHRASE → ::error:: + exit 1)
          # por cliente: db-dump → db-verify → gpg --symmetric AES256 → rm .sql
          # ::add-mask:: sobre cada token

      - name: Subir artefacto cifrado (retención 180 días)
        uses: actions/upload-artifact@v4
        with:
          name: turso-backups-${{ github.run_id }}
          path: backups/*.gpg
          retention-days: 180
          if-no-files-found: error

  notify-failure:
    needs: backup
    if: failure()
    runs-on: ubuntu-latest
    permissions: { issues: write }
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            # abre issue: "⚠️ Backup de BD FALLÓ (run N)" con link al run,
            # fecha, disparo, y checklist (DB_TARGETS, PASSPHRASE, prueba de
            # integridad, logs por cliente/paso)
```

La lógica del loop (dump → verify → gpg → rm) va en el bloque `run` con la misma
forma que Nómina, insertando el paso `db-verify.mjs` entre el dump y el cifrado.
Si el dump **o** la prueba fallan, `set -euo pipefail` corta el job → dispara
`notify-failure`. Así la alerta cubre creación **y** prueba, como se pidió.

### 5. `scripts/backup-preflight.mjs` (NUEVO — chequeo cruzado)

Lee `clients/registry.json` y el secret `DB_TARGETS`. Verifica que **todo cliente
con `active: true` en el registro tenga una entrada correspondiente en
`DB_TARGETS`** (emparejando por `slug`/`name`). Si falta alguno, sale `!= 0` con
`::error::` nombrando al cliente faltante — el backup falla temprano en vez de
omitir silenciosamente una base. Clientes en `DB_TARGETS` que no estén en el
registro solo generan un `::warning::` (no bloquean).

### 6. `docs/BACKUP.md` (adaptado de Nómina)

Documentación operativa con las mismas secciones que
`restaurant-nomina/BACKUP.md`, más la de la prueba automática:
- Cómo funciona (schedule, pasos, cifrado, retención).
- Secrets requeridos (`DB_TARGETS`, `BACKUP_GPG_PASSPHRASE`) con ejemplo.
- Requisito de retención 180 días (subir el ajuste del repo).
- Generar la passphrase (`openssl rand -base64 32`).
- Agregar un cliente nuevo (editar `DB_TARGETS` + `clients/registry.json`).
- Restaurar (descargar artifact → `gpg --decrypt` → `db-restore.mjs` en base
  nueva → verificar → repuntar `TURSO_*` en Vercel).
- Prueba de integridad automática (qué valida y cómo leer un fallo).

## Secrets requeridos (GitHub → Settings → Secrets → Actions)

| Secret | Valor |
|--------|-------|
| `DB_TARGETS` | JSON array `[{ "name": "<slug>", "url": "libsql://...", "token": "..." }]`, una entrada por cliente (incluye demo) |
| `BACKUP_GPG_PASSPHRASE` | Passphrase de cifrado (guardar en gestor de contraseñas; sin ella el backup es irrecuperable) |

## Requisito de configuración del repo

`retention-days: 180` se recorta al máximo del repo (default 90). El repo es
privado → se puede subir hasta 400 días. **Settings → Actions → General →
Artifact and log retention → ≥180**. Sin esto el workflow no falla, pero retiene
menos de 180 días.

## Relación con `clients/registry.json`

- `registry.json` = índice humano, no-secreto (quién existe, dominio, features).
- `DB_TARGETS` = credenciales de backup (url + token por cliente).
- `backup-preflight.mjs` los mantiene sincronizados: falla si un cliente `active`
  del registro no está cubierto por `DB_TARGETS`.

## Fases de implementación

1. **Scripts:** copiar `db-dump.mjs` y `db-restore.mjs` de Nómina; escribir
   `db-verify.mjs` y `backup-preflight.mjs`.
2. **Workflow:** `backup-db.yml` con preflight → loop dump/verify/cifra → upload →
   notify-failure.
3. **Docs:** `docs/BACKUP.md`.
4. **Operacional (fuera del código):** crear secrets `DB_TARGETS` y
   `BACKUP_GPG_PASSPHRASE`; subir la retención del repo a ≥180; correr el workflow
   manualmente una vez (`workflow_dispatch`) y verificar el artifact + que la
   prueba de integridad pasa para demo y Fiori.

## Verificación

- `workflow_dispatch` manual produce un artifact `turso-backups-<run>` con un
  `.gpg` por cliente.
- La prueba de integridad (`db-verify.mjs`) pasa para cada cliente (conteos
  coinciden).
- Un fallo inducido (token inválido en `DB_TARGETS`, o dump manipulado) hace
  fallar el job y **abre el issue de alerta**.
- Round-trip manual: descargar un `.gpg`, descifrar, restaurar en `file:` local,
  confirmar conteos contra el header del dump.

## Riesgos y consideraciones

- **Passphrase perdida = backups irrecuperables.** Debe guardarse en un gestor de
  contraseñas; documentarlo prominentemente.
- **Retención del repo:** si no se sube el ajuste, la retención real < 180 días
  silenciosamente. El doc lo advierte.
- **`DB_TARGETS` desincronizado:** mitigado por `backup-preflight.mjs`.
- **Tamaño de artifacts:** bases pequeñas de restaurante; el crecimiento futuro es
  el disparador para migrar a Cloudflare R2 (no-objetivo de esta iteración).
- **Tokens en logs:** enmascarados con `::add-mask::` sobre cada token, igual que
  Nómina.
