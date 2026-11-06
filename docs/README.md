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
| [`runbooks/releases-y-multicliente.md`](runbooks/releases-y-multicliente.md) | Modelo de ramas puntero, flujo de release (demo → promoción a clientes), feature flags, alta de cliente nuevo |
| [`NOMINA-SYNC-PERMISOS-CATEGORIAS.md`](NOMINA-SYNC-PERMISOS-CATEGORIAS.md) | Contrato de sincronización de permisos por categoría con Nómina Xpress (lado inventario listo; pendiente en Nómina) |

## Referencia histórica

Registros de diseño e implementación. Útiles para entender **por qué** existen
ciertas decisiones, pero **no** son la referencia vigente (el código y los
documentos principales mandan).

| Documento | Naturaleza |
|-----------|-----------|
| [`GUIA_PERMISOS_GRANULARES.md`](GUIA_PERMISOS_GRANULARES.md) | Guía de la migración a permisos granulares (ya implementada) |
| [`superpowers/specs/2026-06-25-control-licores-cocteles-design.md`](superpowers/specs/2026-06-25-control-licores-cocteles-design.md) | Diseño del control de licores por nivel de botella |
| [`superpowers/plans/2026-06-25-control-licores-cocteles.md`](superpowers/plans/2026-06-25-control-licores-cocteles.md) | Plan de implementación de cócteles (la función evolucionó más allá del plan) |
| [`superpowers/specs/2026-07-06-modelo-multicliente-diseno.md`](superpowers/specs/2026-07-06-modelo-multicliente-diseno.md) | Diseño del modelo multi-cliente + feature flags |
| [`superpowers/plans/2026-07-06-modelo-multicliente.md`](superpowers/plans/2026-07-06-modelo-multicliente.md) | Plan de implementación del modelo multi-cliente |
| [`superpowers/specs/2026-07-09-backups-diseno.md`](superpowers/specs/2026-07-09-backups-diseno.md) | Diseño del sistema de backups per-cliente |

## Archivos de instrucciones para agentes de IA

No son documentación de producto; configuran el comportamiento de asistentes de IA
sobre este repositorio.

- [`../CLAUDE.md`](../CLAUDE.md) — Contexto e instrucciones del proyecto para Claude Code.
- [`../AGENTS.md`](../AGENTS.md) — Aviso genérico sobre convenciones de Next.js 16.
