import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente Prisma generado: código minificado/autogenerado (se regenera con
    // `prisma generate`), no es código fuente nuestro y no debe lintearse.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
