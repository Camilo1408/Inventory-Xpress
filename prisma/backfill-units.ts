// prisma/backfill-units.ts
// Normaliza la unidad de todos los productos:
//   - Licores, Gaseosas, Vinos, Cócteles → "botella"
//   - Resto → "unidad"
// Ejecutar con: npx tsx prisma/backfill-units.ts

import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

// Nombres de subcategorías cuyas unidades son botellas.
const BOTTLE_CATEGORY_NAMES = new Set(["Licores", "Gaseosas", "Vinos", "Cócteles"]);

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      unit: true,
      category: { select: { id: true, name: true, parentId: true } },
    },
  });

  console.log(`Productos encontrados: ${products.length}`);

  let bottles = 0;
  let units = 0;
  let unchanged = 0;

  for (const p of products) {
    const catName = p.category?.name ?? "";
    const targetUnit = BOTTLE_CATEGORY_NAMES.has(catName) ? "botella" : "unidad";

    if (p.unit === targetUnit) {
      unchanged += 1;
      continue;
    }

    await prisma.product.update({ where: { id: p.id }, data: { unit: targetUnit } });
    console.log(`  [${targetUnit}] ${p.name}  (${p.unit} → ${targetUnit})  cat: ${catName || "—"}`);

    if (targetUnit === "botella") bottles += 1;
    else units += 1;
  }

  console.log(`\n✓ Actualizados → botella: ${bottles} | unidad: ${units} | sin cambio: ${unchanged}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
