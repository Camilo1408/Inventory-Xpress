import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Categorías base
  const categorias = ["Barra", "Cocina", "Limpieza"];
  for (const name of categorias) {
    const existing = await prisma.category.findFirst({ where: { name, parentId: null } });
    if (!existing) {
      await prisma.category.create({ data: { name } });
    }
  }
  console.log("✓ Categorías creadas:", categorias.join(", "));

  // SUPERADMIN para modo standalone
  const passwordHash = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash,
      name: "Administrador",
      role: "SUPERADMIN",
    },
  });
  console.log("✓ SUPERADMIN creado: admin / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
