import type { NextAuthConfig } from "next-auth";
import { config } from "./config";

// Config edge-safe: solo callbacks JWT, sin providers que usen DB
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
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
