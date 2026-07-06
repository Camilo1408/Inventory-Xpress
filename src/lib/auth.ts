import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { resolveUserPermissions } from "./roles";
import { config } from "./config";

const isStandalone = config.authMode === "standalone";

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
              include: { customRole: true },
            });
            if (!user || !user.active) return null;
            const valid = await bcrypt.compare(
              credentials.password as string,
              user.passwordHash
            );
            if (!valid) return null;
            const perms = resolveUserPermissions(user);
            return {
              id: user.id,
              username: user.username,
              name: user.name ?? user.username,
              role: user.role,
              inventoryAccess: perms.length > 0,
              inventoryPermissions: perms,
              tenantId: "standalone",
            };
          },
        }),
      ]
    : [],
  callbacks: {
    ...authConfig.callbacks,
    // En standalone, re-resolvemos permisos desde la DB en cada request (Node runtime),
    // de modo que un cambio de rol/overrides aplique sin re-login. El middleware (edge)
    // sigue usando el snapshot del JWT solo para el gate grueso de acceso.
    async session({ session, token }) {
      // Campos base desde el token (idéntico a authConfig, que corre en edge).
      session.user.id = token.sub as string;
      session.user.username = token.username as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.inventoryAccess = (token.inventoryAccess as boolean) ?? false;
      session.user.inventoryPermissions = (token.inventoryPermissions as string[]) ?? [];

      // Standalone: refrescar rol y permisos desde la DB (sin re-login).
      if (isStandalone && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          include: { customRole: true },
        });
        if (dbUser) {
          const perms = resolveUserPermissions(dbUser);
          session.user.role = dbUser.role;
          session.user.username = dbUser.username;
          session.user.name = dbUser.name ?? dbUser.username;
          session.user.inventoryPermissions = perms;
          session.user.inventoryAccess = perms.length > 0;
        } else {
          // Usuario borrado → sin acceso.
          session.user.inventoryPermissions = [];
          session.user.inventoryAccess = false;
        }
      }

      return session;
    },
  },
});
