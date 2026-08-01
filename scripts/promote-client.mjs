// scripts/promote-client.mjs
// Promueve el main verificado en demo a la rama puntero de un cliente.
// Empuja el sha de origin/main directamente al ref del cliente: GitHub rechaza
// el push si no es fast-forward, así que el drift queda bloqueado por el servidor
// (no depende de la disciplina de quien lo corre).
//
// Uso:  node scripts/promote-client.mjs <slug>          (muestra qué se promovería)
//       node scripts/promote-client.mjs <slug> --si     (ejecuta el push)

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadRegistry, clientBySlug } from "./lib/registry.mjs";

/**
 * Resuelve a qué rama hay que promover. Puro.
 * @returns {{branch: string, client: object}}
 */
export function resolvePromotion({ registry, slug }) {
  if (!slug) {
    throw new Error("Falta el slug del cliente. Uso: node scripts/promote-client.mjs <slug> [--si]");
  }
  const client = clientBySlug(registry, slug);
  if (!client) {
    throw new Error(`El cliente "${slug}" no está en clients/registry.json.`);
  }
  if (!client.active) {
    throw new Error(`El cliente "${slug}" está inactivo en el registro; no se promueve.`);
  }
  if (client.branch === "main") {
    throw new Error(`"${slug}" despliega desde main (es el demo): se actualiza solo al mergear a main.`);
  }
  return { branch: client.branch, client };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const slug = process.argv[2];
  const confirmed = process.argv.includes("--si");
  const { branch, client } = resolvePromotion({ registry: loadRegistry(), slug });

  git(["fetch", "origin", "--prune"]);
  const mainSha = git(["rev-parse", "refs/remotes/origin/main"]);

  let pending;
  try {
    pending = git(["log", "--oneline", `refs/remotes/origin/${branch}..refs/remotes/origin/main`]);
  } catch {
    console.error(`::error::La rama "${branch}" no existe en el remoto. Créala con: git push origin main:${branch}`);
    process.exit(1);
  }

  if (pending === "") {
    console.error(`"${client.displayName}" ya está en el último main (${mainSha.slice(0, 7)}). Nada que promover.`);
    return;
  }

  console.error(`\nSe promoverá a ${client.displayName} (${branch}) el commit ${mainSha.slice(0, 7)}.`);
  console.error(`Producción del cliente: https://${client.domain}`);
  console.error(`\nCommits que entran:\n${pending}\n`);

  if (!confirmed) {
    console.error("Simulación. Para ejecutarlo de verdad, repite el comando con --si:");
    console.error(`  node scripts/promote-client.mjs ${slug} --si`);
    return;
  }

  // GitHub rechaza el push si no es fast-forward. No usamos --force nunca.
  execFileSync("git", ["push", "origin", `${mainSha}:refs/heads/${branch}`], { stdio: "inherit" });
  console.error(`\nListo. Vercel desplegará ${client.vercelProject} desde ${branch}.`);
  console.error(`Verifica en https://${client.domain} antes de dar por cerrado el release.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
