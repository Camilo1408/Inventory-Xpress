# Documentación — Inventory Xpress

Mapa de toda la documentación del repositorio. Empieza por el documento que
corresponda a tu rol.

## Documentos principales (raíz del repo)

| Documento | Para quién | Cuándo usarlo |
|-----------|-----------|---------------|
| [`../README.md`](../README.md) | Cualquiera | Presentación y arranque rápido del proyecto |
| [`../DOCUMENTACION_COMPLETA_DEL_PROYECTO.md`](../DOCUMENTACION_COMPLETA_DEL_PROYECTO.md) | Desarrolladores / mantenedores | Referencia técnica completa: arquitectura, BD, módulos, permisos, reglas de negocio, despliegue, mantenimiento |
| [`../MANUAL_DE_USUARIO.md`](../MANUAL_DE_USUARIO.md) | Cliente final | Guía paso a paso de cada funcionalidad |

Existen versiones **PDF** de los dos últimos documentos junto a sus `.md`.

## Documentación operativa (`docs/`)

Vigente y de consulta habitual.

| Documento | Tema |
|-----------|------|
| [`BACKUP.md`](BACKUP.md) | Sistema de backups per-cliente: cómo funciona, secrets, restauración, prueba de integridad |
| [`runbooks/releases-y-multicliente.md`](runbooks/releases-y-multicliente.md) | Flujo de releases (demo → clientes), alta de cliente nuevo, consolidación de ramas |
| [`NOMINA-SYNC-PERMISOS-CATEGORIAS.md`](NOMINA-SYNC-PERMISOS-CATEGORIAS.md) | Contrato de sincronización de permisos por categoría con Nómina Xpress (lado inventario listo; pendiente en Nómina) |

## Referencia histórica

Registros de diseño e implementación. Útiles para entender **por qué** existen
ciertas decisiones, pero **no** son la referencia vigente (el código y los
documentos principales mandan).

| Documento | Naturaleza |
|-----------|-----------|
| [`GUIA_PERMISOS_GRANULARES.md`](GUIA_PERMISOS_GRANULARES.md) | Guía de la migración a permisos granulares (ya implementada) |
| [`nomina-spec-permiso-movements-edit.md`](nomina-spec-permiso-movements-edit.md) | Contrato de la clave `inventory:movements:edit` con Nómina (implementado el 2026-07-26) |
| [`superpowers/specs/2026-06-25-control-licores-cocteles-design.md`](superpowers/specs/2026-06-25-control-licores-cocteles-design.md) | Diseño del control de licores por nivel de botella |
| [`superpowers/plans/2026-06-25-control-licores-cocteles.md`](superpowers/plans/2026-06-25-control-licores-cocteles.md) | Plan de implementación de cócteles (la función evolucionó más allá del plan) |
| [`superpowers/specs/2026-07-06-modelo-multicliente-diseno.md`](superpowers/specs/2026-07-06-modelo-multicliente-diseno.md) | Diseño del modelo multi-cliente + feature flags |
| [`superpowers/plans/2026-07-06-modelo-multicliente.md`](superpowers/plans/2026-07-06-modelo-multicliente.md) | Plan de implementación del modelo multi-cliente |
| [`superpowers/specs/2026-07-09-backups-diseno.md`](superpowers/specs/2026-07-09-backups-diseno.md) | Diseño del sistema de backups per-cliente |

## Verificación (baterías E2E)

No hay framework de tests: la regresión se corre a mano con los scripts de `prisma/`
(`e2e-full-suite.ts`, `test-daily-inventory.ts`, `test-movement-edit.ts`,
`test-bottle-entry.ts`). Requisitos y comandos en
[`../DOCUMENTACION_COMPLETA_DEL_PROYECTO.md` §11.1](../DOCUMENTACION_COMPLETA_DEL_PROYECTO.md#111-baterías-e2e-prismats).

## Capturas (`docs/img/`)

Las imágenes que ilustran el manual y la documentación técnica. Se toman del sistema en
funcionamiento, en **modo standalone** con la BD local sembrada: escritorio a 1280×800 (o
1520×800 cuando la tabla es ancha) con densidad ×2, y móvil a 390×844 con densidad ×3.
Al cambiar una pantalla, vuelva a capturar la imagen afectada conservando su nombre.

## Archivos de instrucciones para agentes de IA

No son documentación de producto; configuran el comportamiento de asistentes de IA
sobre este repositorio.

- [`../CLAUDE.md`](../CLAUDE.md) — Contexto e instrucciones del proyecto para Claude Code.
- [`../AGENTS.md`](../AGENTS.md) — Aviso genérico sobre convenciones de Next.js 16.
