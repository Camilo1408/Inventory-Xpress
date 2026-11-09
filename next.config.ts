import type { NextConfig } from "next";
import path from "path";

// Cabeceras de seguridad para todas las respuestas (hallazgo I-H6 del Plan de Calidad).
// Las mismas que usa Nómina Xpress, ajustadas a Vercel Blob (imágenes de productos).
//
// La CSP estuvo primero en modo Report-Only (06/11) y se aplica desde el 09/11: se
// recorrieron todas las páginas del modo integrado sin ninguna violación (detectadas
// con ReportingObserver) y Nómina usa la misma política aplicada sin problemas. Si una
// función nueva necesita otro origen (un CDN, una API externa), agregarlo aquí y
// verificarlo; un origen nuevo se bloquea por defecto.
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
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
