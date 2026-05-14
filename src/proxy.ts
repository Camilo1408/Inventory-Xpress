import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const isStandalone = process.env.AUTH_MODE === "standalone";

export default auth((req) => {
  const session = req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/unauthorized")) return;
  if (isStandalone && pathname.startsWith("/login")) return;

  if (!session) {
    if (isStandalone) {
      return Response.redirect(new URL("/login", req.url));
    }
    const loginUrl = new URL(`${process.env.NOMINA_APP_URL}/login`);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return Response.redirect(loginUrl);
  }

  if (
    session.user.role !== "SUPERADMIN" &&
    !session.user.inventoryAccess
  ) {
    return Response.redirect(new URL("/unauthorized", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
