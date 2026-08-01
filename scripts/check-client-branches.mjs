// scripts/check-client-branches.mjs
// Guarda del modelo de ramas puntero: toda rama client/<slug> declarada en
// clients/registry.json debe existir y ser ANCESTRO de main, es decir, no tener
// commits propios. Si diverge, el fast-forward de la promoción fallaría y el
// cliente quedaría con código que no está en main (justo lo que pasó con la
// vieja rama deploy-fiori).
//
// Estar atrasada respecto a main NO es un error: es el estado normal entre releases.
//
// Uso: node scripts/check-client-branches.mjs
// Requiere un checkout con los refs remotos disponibles (git fetch previo).

import { pathToFileURL } from "node:url";
import { loadRegistry } from "./lib/registry.mjs";
import { tryGit, failFast } from "./lib/git.mjs";

/**
 * Analiza el estado de las ramas puntero. Puro: recibe los datos de git ya resueltos.
 * @param {{registry: object, refs: Record<string, {exists: boolean, isAncestorOfMain: boolean, behind: number}>}} input
 * @returns {{problems: string[], report: string[]}}
 */
export function analyzeBranches({ registry, refs }) {
  const problems = [];
  const report = [];
  for (const client of registry.clients) {
    if (!client.active) continue;
    if (client.branch === "main") continue; // el demo no es puntero
    const info = refs[client.branch] ?? { exists: false, isAncestorOfMain: false, behind: 0 };

    if (!info.exists) {
      problems.push(
        `${client.slug}: la rama "${client.branch}" no existe en el remoto. Créala con: git push origin main:${client.branch}`
      );
      continue;
    }
    if (!info.isAncestorOfMain) {
      problems.push(
        `${client.slug}: la rama "${client.branch}" tiene commits propios que no están en main (divergió). ` +
        `Las ramas puntero no llevan código propio: mueve esos cambios a main o descártalos.`
      );
      continue;
    }
    report.push(
      info.behind === 0
        ? `${client.slug}: "${client.branch}" al día con main.`
        : `${client.slug}: "${client.branch}" ${info.behind} commit(s) detrás de main (pendiente de promover).`
    );
  }
  return { problems, report };
}

/** Resuelve el estado real de una rama contra origin/main. */
function inspectBranch(branch) {
  const remoteRef = `refs/remotes/origin/${branch.replace(/^refs\/heads\//, "")}`;

  const verify = tryGit(["rev-parse", "--verify", "--quiet", remoteRef]);
  if (verify.status === 1) {
    return { exists: false, isAncestorOfMain: false, behind: 0 };
  }
  if (verify.status !== 0) {
    failFast(
      `"git rev-parse --verify --quiet" salió con código ${verify.status} (se esperaba 0 o 1). stderr: ${verify.stderr || "(vacío)"}`,
      remoteRef
    );
  }

  const ancestorCheck = tryGit(["merge-base", "--is-ancestor", remoteRef, "refs/remotes/origin/main"]);
  let isAncestorOfMain;
  if (ancestorCheck.status === 0) {
    isAncestorOfMain = true;
  } else if (ancestorCheck.status === 1) {
    isAncestorOfMain = false;
  } else {
    failFast(
      `"git merge-base --is-ancestor" salió con código ${ancestorCheck.status} (se esperaba 0 o 1). stderr: ${ancestorCheck.stderr || "(vacío)"}. ` +
      `Una causa frecuente es un historial truncado (clone shallow); en CI, usa "fetch-depth: 0" en el checkout.`,
      remoteRef
    );
  }

  const countResult = tryGit(["rev-list", "--count", `${remoteRef}..refs/remotes/origin/main`]);
  if (countResult.status !== 0) {
    failFast(
      `"git rev-list --count" salió con código ${countResult.status}. stderr: ${countResult.stderr || "(vacío)"}`,
      remoteRef
    );
  }
  const behind = Number(countResult.stdout);

  return { exists: true, isAncestorOfMain, behind };
}

function main() {
  const registry = loadRegistry();
  const refs = {};
  for (const client of registry.clients) {
    if (!client.active || client.branch === "main") continue;
    refs[client.branch] = inspectBranch(client.branch);
  }

  const { problems, report } = analyzeBranches({ registry, refs });
  for (const line of report) console.error(`  ${line}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.error(`check-client-branches: OK — ${report.length} rama(s) puntero sin divergencias.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
