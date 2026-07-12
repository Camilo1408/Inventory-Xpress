import type { NextAuthConfig } from "next-auth";
import { config } from "./config";

// Cookie de sesión compartida entre subdominios (modo integrado con Nómina Xpress).
// En integrated NO emitimos la cookie (no hay login aquí): solo la LEEMOS. Para leer la
// misma cookie que emite Nómina en el subdominio hermano, el NOMBRE debe coincidir con
// el de Nómina. Cuando AUTH_COOKIE_DOMAIN está definido (p. ej. ".cucinadeifiori.com")
// fijamos ese nombre/Domain idénticos a Nómina; con el mismo NEXTAUTH_SECRET, el JWT
// valida. Si no está definido (standalone/demo/local), NextAuth usa su cookie por defecto.
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN?.trim();
const sharedSessionCookie = AUTH_COOKIE_DOMAIN
  ? {
      sessionToken: {
        name: "__Secure-authjs.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax" as const,
          path: "/",
          secure: true,
          domain: AUTH_COOKIE_DOMAIN,
        },
      },
    }
  : undefined;

// Config edge-safe: solo callbacks JWT, sin providers que usen DB
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  cookies: sharedSessionCookie,
  providers: [],
  pages: config.authMode === "standalone" ? { signIn: "/login" } : undefined,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.username = (user as { username: string }).username;
        token.inventoryAccess = (user as { inventoryAccess: boolean }).inventoryAccess;
        token.tenantId = (user as { tenantId: string }).tenantId;
        token.inventoryPermissions = (user as { inventoryPermissions?: string[] }).inventoryPermissions ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.username = token.username as string;
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string;
      session.user.inventoryAccess = (token.inventoryAccess as boolean) ?? false;
      session.user.inventoryPermissions = (token.inventoryPermissions as string[]) ?? [];
      return session;
    },
  },
};
