import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    // .claude/worktrees guarda copias del repo: sin esto Vitest las contaría dos veces.
    exclude: [...configDefaults.exclude, ".claude/**"],
    // Crea la base SQLite plantilla de las pruebas de integración (*.db.test.ts).
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
