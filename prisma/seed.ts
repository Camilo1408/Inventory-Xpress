import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import { slugify } from "../src/lib/slug";

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
      await prisma.category.create({ data: { name, slug: slugify(name) } });
    }
  }
  console.log("✓ Categorías creadas:", categorias.join(", "));

  // Usuarios demo (modo standalone) — uno por cada rol base.
  const demoUsers = [
    { username: "superadmin", password: "superadmin123", name: "Super Administrador", role: "SUPERADMIN" },
    { username: "admin",      password: "admin123",      name: "Administrador",        role: "ADMIN" },
    { username: "empleado",   password: "empleado123",   name: "Empleado",             role: "EMPLOYEE" },
  ];

  for (const u of demoUsers) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { username: u.username },
      // Reset determinista: rol, contraseña y limpieza de rol personalizado/overrides.
      update: {
        passwordHash,
        name: u.name,
        role: u.role,
        active: true,
        customRoleId: null,
        permsGrant: "[]",
        permsRevoke: "[]",
      },
      create: {
        username: u.username,
        passwordHash,
        name: u.name,
        role: u.role,
      },
    });
    console.log(`✓ Usuario ${u.role}: ${u.username} / ${u.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
