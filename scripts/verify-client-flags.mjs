// scripts/verify-client-flags.mjs
// Corre al inicio de `pnpm build`. Si el build es de una rama puntero de cliente
// (client/<slug>), exige que los feature flags del entorno coincidan EXACTAMENTE
// con los declarados en clients/registry.json para ese cliente. Falla el build si no.
//
// Evita el fallo histórico: desplegar un cliente sin sus flags y apagarle en
// producción funciones que sí tenía (cócteles, inventario diario).
//
// Es no-op en builds locales, de demo (main) y de ramas de feature.
//
// Variables leídas: VERCEL_GIT_COMMIT_REF (la expone Vercel en build),
//                   NEXT_PUBLIC_FEATURE_* (los flags a verificar).
// Uso: node scripts/verify-client-flags.mjs

import { pathToFileURL } from "node:url";
import { loadRegistry, clientBySlug } from "./lib/registry.mjs";
import { FEATURE_ENV } from "./lib/features.mjs";

/**
 * Compara los flags del entorno contra los declarados en el registro. Puro.
 *
 * El registro es la fuente de verdad de qué ramas `client/*` existen: una rama
 * `client/<algo>` cuyo slug no está en clients/registry.json NO se salta, falla.
 * Saltarla en silencio es justo el escenario que esta guarda existe para impedir
 * (Production Branch mal escrita, o cliente borrado del registro con su proyecto
 * Vercel todavía vivo, desplegando sin que nadie verifique sus flags).
 *
 * @returns {{skipped: boolean, reason?: string, slug?: string, problems: string[]}}
 */
export function checkFlags({ registry, ref, env }) {
  if (!ref || !ref.startsWith("client/")) {
    return { skipped: true, reason: `la rama "${ref ?? "(sin rama)"}" no es de cliente`, problems: [] };
  }
  const slug = ref.slice("client/".length);
  const client = clientBySlug(registry, slug);
  if (!client) {
    return {
      skipped: false,
      slug,
      problems: [
        `la rama "${ref}" no corresponde a ningún cliente en clients/registry.json. ` +
          `Revisa la Production Branch configurada en Vercel, o si el cliente fue dado de baja del registro, desconecta su proyecto Vercel.`,
      ],
    };
  }

  const problems = [];
  const declared = new Set(client.features);
  for (const [feature, envVar] of Object.entries(FEATURE_ENV)) {
    const encendida = env[envVar] === "true";
    if (declared.has(feature) && !encendida) {
      problems.push(
        `${envVar} debe valer "true" (el registro declara "${feature}" para ${slug}), pero vale "${env[envVar] ?? "(sin definir)"}".`
      );
    }
    if (!declared.has(feature) && encendida) {
      problems.push(
        `${envVar} está en "true" pero la feature "${feature}" no está declarada para ${slug} en clients/registry.json.`
      );
    }
  }
  return { skipped: false, slug, problems };
}

function main() {
  // Resolvemos la rama y decidimos si aplica ANTES de cargar el registro: un
  // clients/registry.json con un error de forma no debe reventar el build de
  // ramas para las que esta verificación sería un no-op de todos modos (demo,
  // ramas de feature, builds locales sin VERCEL_GIT_COMMIT_REF).
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  if (!ref || !ref.startsWith("client/")) {
    console.error(`verify-client-flags: sin verificación — la rama "${ref ?? "(sin rama)"}" no es de cliente.`);
    return;
  }

  let registry;
  try {
    registry = loadRegistry();
  } catch (e) {
    console.error(`::error::verify-client-flags: no se pudo cargar clients/registry.json: ${e.message}`);
    process.exit(1);
    return;
  }

  const result = checkFlags({ registry, ref, env: process.env });

  if (result.skipped) {
    console.error(`verify-client-flags: sin verificación — ${result.reason}.`);
    return;
  }
  if (result.problems.length > 0) {
    console.error(`::error::verify-client-flags: la rama "${ref}" no pasa la verificación:`);
    for (const p of result.problems) console.error(`::error::  - ${p}`);
    console.error("::error::Corrige las Environment Variables del proyecto en Vercel, o clients/registry.json, y vuelve a desplegar.");
    process.exit(1);
  }
  console.error(`verify-client-flags: OK — flags de "${result.slug}" coinciden con el registro.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
