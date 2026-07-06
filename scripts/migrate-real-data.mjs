// Migra los datos reales de inventario.db (local) a la base Turso de producción.
// No toca la tabla User: la demo se queda con los usuarios del seed.
// Ejecutar con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN apuntando a la DB destino:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-real-data.mjs

import { createClient } from "@libsql/client";

const source = createClient({ url: "file:./inventario.db" });
const dest = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function insertRows(table, rows) {
  if (rows.length === 0) {
    console.log(`${table}: 0 filas, se omite`);
    return;
  }
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((c) => `:${c}`).join(", ");
  const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
  for (const row of rows) {
    await dest.execute({ sql, args: row });
  }
  console.log(`${table}: ${rows.length} filas migradas`);
}

async function fetchAll(table) {
  const res = await source.execute(`SELECT * FROM "${table}"`);
  return res.rows.map((r) => Object.fromEntries(Object.entries(r)));
}

async function main() {
  console.log("Limpiando categorías de seed en destino...");
  await dest.execute(`DELETE FROM "Category"`);

  console.log("Leyendo datos locales...");
  const categoriesRaw = await fetchAll("Category");
  const products = await fetchAll("Product");
  const dailyInventories = await fetchAll("DailyInventory");
  const dailyInventoryItems = await fetchAll("DailyInventoryItem");
  const stockMovements = await fetchAll("StockMovement");
  const auditLogs = await fetchAll("AuditLog");

  // Orden topológico de categorías: raíces primero, luego hijas (asume 2 niveles).
  const inserted = new Set();
  const orderedCategories = [];
  function canInsert(c) {
    return c.parentId === null || inserted.has(c.parentId);
  }
  let remaining = [...categoriesRaw];
  while (remaining.length > 0) {
    const ready = remaining.filter(canInsert);
    if (ready.length === 0) throw new Error("Ciclo o padre faltante en categorías");
    for (const c of ready) {
      orderedCategories.push(c);
      inserted.add(c.id);
    }
    remaining = remaining.filter((c) => !inserted.has(c.id));
  }

  await insertRows("Category", orderedCategories);
  await insertRows("Product", products);
  await insertRows("DailyInventory", dailyInventories);
  await insertRows("DailyInventoryItem", dailyInventoryItems);
  await insertRows("StockMovement", stockMovements);
  await insertRows("AuditLog", auditLogs);

  console.log("Migración completa.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
