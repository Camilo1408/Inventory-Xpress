import { createClient } from "@libsql/client";
import fs from "node:fs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const sqlPath = process.argv[2];

const client = createClient({ url, authToken });
const sql = fs.readFileSync(sqlPath, "utf8");

const statements = sql
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter((s) => s.length > 0);

for (const stmt of statements) {
  console.log("Executing:", stmt.slice(0, 60).replace(/\n/g, " "), "...");
  await client.execute(stmt);
}
console.log(`Done. Applied ${statements.length} statements.`);
