import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { uniqueSlug } from "../src/lib/slug";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const all = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });
  const used = new Set<string>(all.filter((c) => c.slug).map((c) => c.slug as string));

  let updated = 0;
  for (const c of all) {
    if (c.slug) continue;
    const slug = uniqueSlug(c.name, used);
    used.add(slug);
    await prisma.category.update({ where: { id: c.id }, data: { slug } });
    updated += 1;
    console.log(`  ${c.name} → ${slug}`);
  }
  console.log(`✓ Slugs asignados: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
