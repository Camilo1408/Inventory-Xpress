// scripts/provision-client.mjs
// Aprovisiona la BD Turso de un cliente nuevo y guía el resto del alta.
// Uso: TURSO_API_TOKEN=... TURSO_ORG=<org> node scripts/provision-client.mjs <slug>
// Requiere el CLI de turso instalado (o la API de plataforma). Este script usa
// la API HTTP de Turso para crear la base y luego aplica schema + seed.

import { execSync } from "node:child_process";

const slug = process.argv[2];
const apiToken = process.env.TURSO_API_TOKEN;
const org = process.env.TURSO_ORG;

if (!slug) {
  console.error("Falta el slug del cliente. Uso: node scripts/provision-client.mjs <slug>");
  process.exit(1);
}
if (!apiToken || !org) {
  console.error("Faltan TURSO_API_TOKEN y/o TURSO_ORG en el entorno.");
  console.error("Genera el API token en app.turso.tech -> Account -> API Tokens.");
  process.exit(1);
}

const dbName = `inventory-${slug}`;

async function api(path, method = "GET", body) {
  const res = await fetch(`https://api.turso.tech/v1/organizations/${org}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Turso API ${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log(`Creando BD Turso "${dbName}" en org "${org}"...`);
  await api("/databases", "POST", { name: dbName, group: "default" });

  const { database } = await api(`/databases/${dbName}`);
  const url = `libsql://${database.Hostname}`;

  console.log("Emitiendo token de la BD...");
  const tokenRes = await api(`/databases/${dbName}/auth/tokens`, "POST", {});
  const dbToken = tokenRes.jwt;

  console.log("Generando SQL de schema...");
  execSync("npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o .provision.sql", { stdio: "inherit" });

  console.log("Aplicando schema...");
  execSync("node scripts/apply-turso-sql.mjs .provision.sql", {
    stdio: "inherit",
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: dbToken },
  });

  console.log("Corriendo seed inicial...");
  execSync("npx tsx prisma/seed.ts", {
    stdio: "inherit",
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: dbToken },
  });

  execSync("rm -f .provision.sql");

  const branch = `client/${slug}`;
  const secretName = `TURSO_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`;

  console.log("\n─── LISTO. Pasos manuales restantes ───");
  console.log(`1. Crear la rama puntero del cliente (sin código propio, solo avanza por fast-forward):`);
  console.log(`     git fetch origin && git push origin origin/main:refs/heads/${branch}`);
  console.log(`2. Agregar la entrada en clients/registry.json:`);
  console.log(`     { "slug": "${slug}", "displayName": "...", "domain": "...",`);
  console.log(`       "vercelProject": "inventory-xpress-${slug}", "tursoDatabase": "${dbName}",`);
  console.log(`       "branch": "${branch}", "features": [], "active": true }`);
  console.log(`     Las features válidas hoy son: cocktails, dailyInventory.`);
  console.log(`3. Crear el proyecto Vercel enlazado al repo con Production Branch = ${branch}.`);
  console.log(`4. Setear env vars en ese proyecto (target Production):`);
  console.log(`     TURSO_DATABASE_URL=${url}`);
  console.log(`     TURSO_AUTH_TOKEN=<el token emitido arriba>`);
  console.log(`     NEXTAUTH_SECRET=<genera uno único>`);
  console.log(`     NEXTAUTH_URL=<url pública del cliente>`);
  console.log(`     AUTH_MODE=standalone`);
  console.log(`     Un flag por cada feature declarada en el registro; si no coinciden, el build FALLA:`);
  console.log(`       cocktails      -> NEXT_PUBLIC_FEATURE_COCKTAILS=true`);
  console.log(`       dailyInventory -> NEXT_PUBLIC_FEATURE_DAILY_INV=true`);
  console.log(`5. Ignored Build Step del proyecto (Settings -> Git), para no construir otras ramas:`);
  console.log(`     if [ "$VERCEL_GIT_COMMIT_REF" = "${branch}" ]; then exit 1; else exit 0; fi`);
  console.log(`6. Configurar el subdominio + CNAME en DNS.`);
  console.log(`7. Guardar el token de la BD como secret de GitHub: ${secretName}`);
  console.log(`8. Añadir el cliente al secret DB_TARGETS para que entre en el backup semanal.`);
  console.log(`9. Verificar: node scripts/check-client-branches.mjs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
