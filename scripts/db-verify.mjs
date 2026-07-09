/**
 * Prueba de integridad de un dump .sql (generado por scripts/db-dump.mjs).
 * OFFLINE y no destructivo respecto a producción: restaura el dump en una base
 * LOCAL temporal y verifica que sea restaurable y completo, comparando los
 * conteos reales contra los esperados que el dump embebe en sus comentarios
 * (`-- Tabla: <nombre> (<N> filas)`).
 *
 * Sale 0 si todo coincide; != 0 (con `::error::`) si el SQL no es restaurable
 * o si algún conteo no cuadra. No requiere credenciales.
 *
 * Uso:
 *   node scripts/db-verify.mjs <archivo-dump.sql>
 */
import { createClient } from "@libsql/client";
import { readFileSync, rmSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/db-verify.mjs <archivo-dump.sql>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");

// Conteos esperados desde los comentarios del dump: "-- Tabla: X (N filas)".
const expected = new Map();
let expectedTotal = 0;
for (const line of sql.split("\n")) {
  const m = line.match(/^-- Tabla: (.+) \((\d+) filas\)$/);
  if (m) {
    const n = Number(m[2]);
    expected.set(m[1], n);
    expectedTotal += n;
  }
}
if (expected.size === 0) {
  console.error(`::error::El dump ${file} no contiene cabeceras "-- Tabla: X (N filas)"; no es un dump de db-dump.mjs o está corrupto.`);
  process.exit(1);
}

// Base local temporal única (no toca producción ni la nube).
const tmp = `.verify-${process.pid}-${Date.now()}.db`;
const db = createClient({ url: `file:${tmp}` });

function cleanup() {
  for (const suffix of ["", "-shm", "-wal"]) {
    try { rmSync(tmp + suffix, { force: true }); } catch { /* noop */ }
  }
}

async function main() {
  await db.executeMultiple(sql);

  const problems = [];
  let actualTotal = 0;
  for (const [table, exp] of expected) {
    let actual;
    try {
      const res = await db.execute(`SELECT COUNT(*) AS c FROM "${table}"`);
      actual = Number(res.rows[0].c);
    } catch (e) {
      problems.push(`tabla "${table}" no existe tras restaurar (${e.message})`);
      continue;
    }
    actualTotal += actual;
    if (actual !== exp) {
      problems.push(`tabla "${table}": esperadas ${exp} filas, restauradas ${actual}`);
    }
  }

  await db.close();

  if (problems.length > 0) {
    console.error(`::error::Prueba de integridad FALLÓ para ${file}:`);
    for (const p of problems) console.error(`::error::  - ${p}`);
    process.exit(1);
  }

  console.error(`Integridad OK: ${expected.size} tablas, ${actualTotal} filas restauradas (esperadas ${expectedTotal}). ${file}`);
}

main()
  .catch((e) => {
    console.error(`::error::ERROR restaurando ${file} para verificar: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(cleanup);
