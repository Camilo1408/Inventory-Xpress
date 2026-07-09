/**
 * Chequeo previo del backup: garantiza que todo cliente `active` de
 * clients/registry.json tenga una entrada correspondiente en el secret
 * DB_TARGETS (emparejando por slug/name). Evita que se omita silenciosamente
 * la base de un cliente nuevo que se agregó al registro pero no a DB_TARGETS.
 *
 * - Falta un cliente active en DB_TARGETS  -> ::error:: + exit 1 (bloquea).
 * - Entrada en DB_TARGETS sin cliente en el registro -> ::warning:: (no bloquea).
 *
 * Credenciales SOLO por env:
 *   DB_TARGETS  JSON array [{ "name", "url", "token" }]  (requerido)
 *
 * Uso: node scripts/backup-preflight.mjs
 */
import { readFileSync } from "node:fs";

const raw = process.env.DB_TARGETS;
if (!raw) {
  console.error("::error::Falta el secret DB_TARGETS (JSON array de {name,url,token}).");
  process.exit(1);
}

let targets;
try {
  targets = JSON.parse(raw);
  if (!Array.isArray(targets)) throw new Error("no es un array");
} catch (e) {
  console.error(`::error::DB_TARGETS no es un JSON array válido: ${e.message}`);
  process.exit(1);
}

const targetNames = new Set(targets.map((t) => t.name));

const registry = JSON.parse(readFileSync("clients/registry.json", "utf8"));
const activeClients = registry.clients.filter((c) => c.active);

const missing = activeClients.filter((c) => !targetNames.has(c.slug));
const registrySlugs = new Set(registry.clients.map((c) => c.slug));
const orphanTargets = targets.filter((t) => !registrySlugs.has(t.name));

for (const t of orphanTargets) {
  console.error(`::warning::DB_TARGETS incluye "${t.name}" que no está en clients/registry.json.`);
}

if (missing.length > 0) {
  console.error("::error::Clientes active en el registro que faltan en DB_TARGETS:");
  for (const c of missing) console.error(`::error::  - ${c.slug} (${c.displayName})`);
  console.error("::error::Agrega su entrada { name, url, token } al secret DB_TARGETS.");
  process.exit(1);
}

console.error(`Preflight OK: ${activeClients.length} clientes active cubiertos por DB_TARGETS.`);
