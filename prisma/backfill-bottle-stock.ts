// prisma/backfill-bottle-stock.ts
// Recalcula currentStock de todos los productos cuyo seguimiento es por botella
// (categoría slug "cocteles"): stock = reserveBottles + (bottleLevel != null ? 1 : 0)
// Ejecutar con: npx tsx prisma/backfill-bottle-stock.ts

import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

function bottleStock(level: string | null, reserve: number | null): number {
  return (reserve ?? 0) + (level != null ? 1 : 0);
}

async function main() {
  const products = await prisma.product.findMany({
    where: { category: { slug: "cocteles" } },
    select: { id: true, name: true, bottleLevel: true, reserveBottles: true, currentStock: true },
  });

  console.log(`Productos de cócteles encontrados: ${products.length}`);

  let updated = 0;
  let unchanged = 0;

  for (const p of products) {
    const expected = bottleStock(p.bottleLevel, p.reserveBottles);
    if (p.currentStock === expected) { unchanged++; continue; }

    await prisma.product.update({ where: { id: p.id }, data: { currentStock: expected } });
    console.log(`  ${p.name}: ${p.currentStock} → ${expected}  (nivel: ${p.bottleLevel ?? "null"}, reserva: ${p.reserveBottles ?? 0})`);
    updated++;
  }

  console.log(`\n✓ Actualizados: ${updated} | Sin cambio: ${unchanged}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
