import type { NextAuthConfig } from "next-auth";
import { config } from "./config";
import { applyNominaSession } from "./session-check";

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
        // Nombre propio a propósito (no el default "__Secure-authjs.session-token").
        // DEBE ser idéntico al de nómina: es el nombre de cookie que emite nómina
        // y también la sal de cifrado del JWT compartido, así que el inventario
        // tiene que leer/descifrar exactamente este nombre. Ver nota en el auth.ts
        // de nómina sobre por qué se renombró (evita colisión con cookies viejas).
        name: "__Secure-nx.session-token",
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

// Duración de la sesión: IGUAL a la de Nómina Xpress (12 h, renovada cada hora).
// Aunque aquí no hay login en modo integrated, Auth.js vuelve a firmar el JWT y a
// emitir la cookie (con el Domain compartido) cada vez que se consulta la sesión.
// Con el default de 30 días, el inventario extendía la vida de la cookie de Nómina
// y anulaba su revocación de sesiones (hallazgo I-H1 del Plan de Calidad).
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60;

// Config edge-safe: solo callbacks JWT, sin providers que usen DB
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
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
      // Integrated: la sesión la emite Nómina. Le preguntamos si sigue vigente y por
      // los permisos actuales (I-H1b); null cierra la sesión. Ver session-check.ts.
      if (config.authMode === "integrated") return applyNominaSession(token);
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
