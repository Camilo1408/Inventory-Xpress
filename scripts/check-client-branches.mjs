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

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadRegistry } from "./lib/registry.mjs";

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

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Resuelve el estado real de una rama contra origin/main. */
function inspectBranch(branch) {
  const remoteRef = `refs/remotes/origin/${branch.replace(/^refs\/heads\//, "")}`;
  let exists = true;
  try {
    git(["rev-parse", "--verify", "--quiet", remoteRef]);
  } catch {
    exists = false;
  }
  if (!exists) return { exists: false, isAncestorOfMain: false, behind: 0 };

  let isAncestorOfMain = true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", remoteRef, "refs/remotes/origin/main"], { stdio: "ignore" });
  } catch {
    isAncestorOfMain = false;
  }
  const behind = Number(git(["rev-list", "--count", `${remoteRef}..refs/remotes/origin/main`]));
  return { exists, isAncestorOfMain, behind };
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
