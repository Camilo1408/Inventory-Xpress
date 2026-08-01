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
import { tryGit, failFast } from "./lib/git.mjs";

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

  const remoteRef = `refs/remotes/origin/${branch}`;
  const logResult = tryGit(["log", "--oneline", `${remoteRef}..refs/remotes/origin/main`]);
  let pending;
  if (logResult.status === 128) {
    // "unknown revision" es lo que git devuelve cuando el ref no existe en el remoto.
    console.error(`::error::La rama "${branch}" no existe en el remoto. Créala con: git push origin main:${branch}`);
    process.exit(1);
  } else if (logResult.status !== 0) {
    failFast(
      `"git log" salió con código ${logResult.status} (se esperaba 0 o 128). stderr: ${logResult.stderr || "(vacío)"}`,
      remoteRef
    );
  } else {
    pending = logResult.stdout;
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
  const pushResult = tryGit(["push", "origin", `${mainSha}:refs/heads/${branch}`]);
  if (pushResult.status !== 0) {
    console.error(
      `::error::El push a "${branch}" fue rechazado. stderr: ${pushResult.stderr || "(vacío)"} ` +
      `Un rechazo por non-fast-forward significa que la rama del cliente tiene commits propios (drift): revísala con ` +
      `check-client-branches.mjs antes de reintentar.`
    );
    process.exit(1);
  }
  console.error(`\nListo. Vercel desplegará ${client.vercelProject} desde ${branch}.`);
  console.error(`Verifica en https://${client.domain} antes de dar por cerrado el release.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
