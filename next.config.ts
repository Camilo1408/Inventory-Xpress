import type { NextConfig } from "next";
import path from "path";

// Cabeceras de seguridad para todas las respuestas (hallazgo I-H6 del Plan de Calidad).
// Las mismas que usa Nómina Xpress, ajustadas a Vercel Blob (imágenes de productos).
//
// La CSP va primero en modo REPORT-ONLY: el navegador avisa en la consola de lo que
// bloquearía, pero no bloquea nada. Como `main` despliega directo a producción, así se
// valida contra el uso real sin riesgo de romper el inventario; cuando la consola quede
// limpia se cambia la clave a "Content-Security-Policy" para que se aplique.
const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La cámara se permite al propio origen: la carga de fotos de productos puede usarla.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
    "@prisma/client",
    "prisma",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
