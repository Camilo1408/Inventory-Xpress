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
 * @returns {{skipped: boolean, reason?: string, slug?: string, problems: string[]}}
 */
export function checkFlags({ registry, ref, env }) {
  if (!ref || !ref.startsWith("client/")) {
    return { skipped: true, reason: `la rama "${ref ?? "(sin rama)"}" no es de cliente`, problems: [] };
  }
  const slug = ref.slice("client/".length);
  const client = clientBySlug(registry, slug);
  if (!client) {
    return { skipped: true, reason: `"${slug}" no está en clients/registry.json`, problems: [] };
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
  const registry = loadRegistry();
  const result = checkFlags({
    registry,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
    env: process.env,
  });

  if (result.skipped) {
    console.error(`verify-client-flags: sin verificación — ${result.reason}.`);
    return;
  }
  if (result.problems.length > 0) {
    console.error(`::error::Los feature flags de "${result.slug}" no coinciden con clients/registry.json:`);
    for (const p of result.problems) console.error(`::error::  - ${p}`);
    console.error("::error::Corrige las Environment Variables del proyecto en Vercel, o el registro, y vuelve a desplegar.");
    process.exit(1);
  }
  console.error(`verify-client-flags: OK — flags de "${result.slug}" coinciden con el registro.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
