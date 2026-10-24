// scripts/lib/registry.mjs
// Carga y validación de clients/registry.json — la fuente de verdad de qué
// clientes existen, desde qué rama despliegan y qué features tienen encendidas.
// Sin I/O de red: solo lee el archivo. Las funciones de validación son puras.

import { readFileSync } from "node:fs";
import { KNOWN_FEATURES } from "./features.mjs";

const REQUIRED_STRINGS = ["slug", "displayName", "domain", "vercelProject", "tursoDatabase", "branch"];

/**
 * Valida la forma del registro. Puro: no toca disco ni red.
 * @returns {string[]} lista de problemas; vacía significa válido.
 */
export function validateRegistry(data) {
  const problems = [];
  if (!data || typeof data !== "object" || !Array.isArray(data.clients)) {
    return ['El registro debe ser un objeto con un array "clients".'];
  }
  const seen = new Set();
  for (const [i, c] of data.clients.entries()) {
    const label = c?.slug ? `cliente "${c.slug}"` : `cliente #${i}`;
    for (const field of REQUIRED_STRINGS) {
      if (typeof c?.[field] !== "string" || c[field].trim() === "") {
        problems.push(`${label}: falta el campo obligatorio "${field}" (string no vacío).`);
      }
    }
    if (typeof c?.active !== "boolean") {
      problems.push(`${label}: "active" debe ser booleano.`);
    }
    if (!Array.isArray(c?.features)) {
      problems.push(`${label}: "features" debe ser un array.`);
    } else {
      for (const f of c.features) {
        if (!KNOWN_FEATURES.includes(f)) {
          problems.push(`${label}: feature desconocida "${f}". Válidas: ${KNOWN_FEATURES.join(", ")}.`);
        }
      }
    }
    if (typeof c?.slug === "string") {
      if (seen.has(c.slug)) problems.push(`slug duplicado: "${c.slug}".`);
      seen.add(c.slug);
      // El demo despliega desde main; los clientes reales desde su rama puntero.
      const expected = c.slug === "demo" ? "main" : `client/${c.slug}`;
      if (typeof c.branch === "string" && c.branch !== expected) {
        problems.push(`${label}: "branch" debe ser "${expected}", no "${c.branch}".`);
      }
    }
  }
  return problems;
}

/** Lee el registro del disco y lo valida. Lanza si es inválido. */
export function loadRegistry(path = "clients/registry.json") {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`No se pudo leer ${path}: ${e.message}`);
  }
  const problems = validateRegistry(parsed);
  if (problems.length > 0) {
    throw new Error(`${path} es inválido:\n  - ${problems.join("\n  - ")}`);
  }
  return parsed;
}

/** Busca un cliente por slug. Puro. */
export function clientBySlug(registry, slug) {
  return registry.clients.find((c) => c.slug === slug);
}
