## Qué cambia y por qué

<!-- Qué problema resuelve (ID del plan: I-H…, RN-I…, CP-…) y qué cambia para el usuario. -->

## Cómo se verificó

<!-- Pruebas nuevas, qué se probó en local (modo integrated y/o standalone) y con qué datos. -->

## Autorrevisión (G12 del Plan de Calidad)

Proyecto con un solo desarrollador: esta lista reemplaza la revisión de una segunda persona.
El CI ("Tipos, lint, pruebas y build") ya es obligatorio para hacer merge.

- [ ] Leí el diff completo en GitHub, archivo por archivo (`git diff -w` si hay ruido de saltos de línea).
- [ ] Toda ruta nueva o modificada verifica el permiso antes de tocar la base (regla 4).
- [ ] Todo cuerpo de petición pasa por `parseBody(req, schema)`; nada de `req.json() as` (regla 4).
- [ ] `currentStock` solo cambia dentro de una transacción con su `StockMovement` (regla 2).
- [ ] Sin `any`, sin secretos ni contraseñas en código, docs o pruebas.
- [ ] Hay pruebas que fallarían sin este cambio (o explico por qué no aplica).
- [ ] Si cambia el esquema: script de migración idempotente, aplicado en el demo antes del merge.
- [ ] Si cambia un origen externo (CDN, API, imágenes): actualizada la CSP de `next.config.ts`.
- [ ] Si cambia la funcionalidad: actualizados `DOCUMENTACION_COMPLETA_DEL_PROYECTO.md`,
      `MANUAL_DE_USUARIO.md` y sus PDF (`pnpm docs:pdf`).
- [ ] Después del merge: verificar el demo antes de promover a un cliente (`scripts/promote-client.mjs`).
