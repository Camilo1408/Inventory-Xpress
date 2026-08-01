// scripts/lib/git.mjs
// Helpers compartidos para invocar git desde scripts de despliegue sin que un
// código de salida no-cero se convierta en una excepción cruda de Node. El
// llamador decide qué códigos son resultados esperados (p.ej. 1 = "no
// ancestro") y cuáles son fallos reales que deben abortar el script.

import { execFileSync } from "node:child_process";

/**
 * Ejecuta git sin lanzar en códigos de salida no-cero: devuelve el status real
 * junto con stdout/stderr para que el llamador decida qué códigos son
 * significativos (p.ej. 1 = "no ancestro") y cuáles son errores reales.
 */
export function tryGit(args) {
  try {
    const stdout = execFileSync("git", args, { encoding: "utf8" });
    return { status: 0, stdout: stdout.trim(), stderr: "" };
  } catch (err) {
    return {
      status: typeof err.status === "number" ? err.status : 1,
      stdout: "",
      stderr: (err.stderr ?? "").toString().trim(),
    };
  }
}

/** Aborta el script entero: usado cuando un comando git falla por una razón real (no un resultado esperado). */
export function failFast(message, ref) {
  console.error(`::error::No se pudo completar la verificación. ${message} (ref: ${ref})`);
  process.exit(1);
}
