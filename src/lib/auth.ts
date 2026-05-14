import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

const isStandalone = process.env.AUTH_MODE === "standalone";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: isStandalone
    ? [
        Credentials({
          credentials: {
            username: { label: "Usuario" },
            password: { label: "Contraseña", type: "password" },
          },
          async authorize(credentials) {
            if (!credentials?.username || !credentials?.password) return null;
            const user = await prisma.user.findUnique({
              where: { username: credentials.username as string },
            });
            if (!user || !user.active) return null;
            const valid = await bcrypt.compare(
              credentials.password as string,
              user.passwordHash
            );
            if (!valid) return null;
            return {
              id: user.id,
              username: user.username,
              name: user.name ?? user.username,
              role: user.role,
              inventoryAccess: true,
              tenantId: "standalone",
            };
          },
        }),
      ]
    : [],
});
