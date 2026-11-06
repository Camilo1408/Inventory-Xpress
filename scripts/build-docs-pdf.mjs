// scripts/build-docs-pdf.mjs
// Regenera los PDF de la documentación a partir de sus .md (fuente de verdad):
//   DOCUMENTACION_COMPLETA_DEL_PROYECTO.md → .pdf
//   MANUAL_DE_USUARIO.md                   → .pdf
//
// Convierte el Markdown con `marked` y lo imprime con Chrome (o Edge) en modo headless
// por el protocolo DevTools (Page.printToPDF como stream), con las imágenes de docs/img/ locales.
// Es el mismo generador y la misma hoja de estilo (azul/slate del sistema de diseño)
// con que se hicieron los PDF hasta ahora; antes vivía fuera del repo.
//
// Uso:  node scripts/build-docs-pdf.mjs
//       CHROME_PATH="C:\ruta\chrome.exe" node scripts/build-docs-pdf.mjs   (otro navegador)
//
// Regenerar los PDF en el mismo cambio que toque alguno de los dos .md o docs/img/.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { marked } from "marked";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 9334;
const SEND_TIMEOUT_MS = 120_000;
const log = (...a) => { if (process.env.DEBUG) console.log("  ·", ...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DOCS = [
  { md: "MANUAL_DE_USUARIO.md", pdf: "MANUAL_DE_USUARIO.pdf" },
  { md: "DOCUMENTACION_COMPLETA_DEL_PROYECTO.md", pdf: "DOCUMENTACION_COMPLETA_DEL_PROYECTO.pdf" },
];

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: #1e293b; margin: 0;
  }
  h1, h2, h3, h4 { color: #0f172a; line-height: 1.25; margin: 1.4em 0 .5em; }
  h1 { font-size: 20pt; border-bottom: 2px solid #2563EB; padding-bottom: .25em; margin-top: 0; }
  h2 { font-size: 14.5pt; border-bottom: 1px solid #E2E8F0; padding-bottom: .2em; page-break-after: avoid; }
  h3 { font-size: 12pt; page-break-after: avoid; }
  h4 { font-size: 10.5pt; page-break-after: avoid; }
  p, ul, ol, table, pre, blockquote { margin: .55em 0; }
  a { color: #2563EB; text-decoration: none; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9pt;
         background: #F1F5F9; padding: .1em .35em; border-radius: 3px; }
  pre { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;
        padding: .7em .9em; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.5pt; line-height: 1.4; white-space: pre-wrap; }
  blockquote { border-left: 3px solid #2563EB; background: #F8FAFC; margin-left: 0;
               padding: .5em .9em; color: #334155; page-break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; page-break-inside: avoid; }
  th, td { border: 1px solid #E2E8F0; padding: .35em .55em; text-align: left; vertical-align: top; }
  th { background: #F1F5F9; font-weight: 600; }
  img { max-width: 100%; max-height: 135mm; width: auto; height: auto; display: block;
        margin: .8em auto; border: 1px solid #E2E8F0; border-radius: 6px;
        page-break-inside: avoid; }
  hr { border: 0; border-top: 1px solid #E2E8F0; margin: 1.6em 0; }
  li { margin: .18em 0; }
  @page { size: A4; margin: 16mm 14mm; }
`;

/** Cliente mínimo del protocolo DevTools sobre el WebSocket nativo de Node (22+). */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.sessionId = null;
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data));
      const p = m.id && this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error)));
      else p.resolve(m.result);
    });
  }
  send(method, params = {}, useSession = true) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (useSession && this.sessionId) msg.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} no respondió en ${SEND_TIMEOUT_MS / 1000} s`));
      }, SEND_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }
}

async function main() {
  const browser = BROWSERS.find((b) => existsSync(b));
  if (!browser) throw new Error("No encontré Chrome ni Edge. Indica la ruta con CHROME_PATH.");

  const profile = mkdtempSync(path.join(tmpdir(), "docs-pdf-"));
  const proc = spawn(browser, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files", "about:blank",
  ], { stdio: "ignore" });

  try {
    let version = null;
    for (let i = 0; i < 40 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error(`${path.basename(browser)} no arrancó`);

    log("navegador listo:", version.Browser);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }, false);
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true }, false);
    cdp.sessionId = sessionId;
    await cdp.send("Page.enable");

    for (const doc of DOCS) {
      const md = readFileSync(path.join(ROOT, doc.md), "utf8");
      const body = marked.parse(md, { gfm: true, breaks: false });
      const title = doc.md.replace(/\.md$/, "");
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
      // Junto a los .md para que las rutas relativas de docs/img/ resuelvan.
      const tmp = path.join(ROOT, ".doc-render.html");
      writeFileSync(tmp, html, "utf8");
      try {
        log("navegando", doc.md);
        await cdp.send("Page.navigate", { url: pathToFileURL(tmp).href });
        await sleep(3500); // dar tiempo a cargar las imágenes locales

        log("imprimiendo", doc.md);
        // Como stream y por partes: el manual pesa varios MB y en un solo mensaje del
        // protocolo no siempre llega.
        const { stream } = await cdp.send("Page.printToPDF", {
          printBackground: true, paperWidth: 8.27, paperHeight: 11.69,
          marginTop: 0.63, marginBottom: 0.63, marginLeft: 0.55, marginRight: 0.55,
          preferCSSPageSize: true, transferMode: "ReturnAsStream",
        });
        const chunks = [];
        for (;;) {
          const part = await cdp.send("IO.read", { handle: stream, size: 1024 * 1024 });
          chunks.push(Buffer.from(part.data, part.base64Encoded ? "base64" : "utf8"));
          if (part.eof) break;
        }
        await cdp.send("IO.close", { handle: stream });
        const out = path.join(ROOT, doc.pdf);
        writeFileSync(out, Buffer.concat(chunks));
        const size = (statSync(out).size / 1024 / 1024).toFixed(2);
        const pages = (readFileSync(out).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
        console.log(`  ✓ ${doc.pdf} — ${pages} páginas, ${size} MB`);
      } finally {
        rmSync(tmp, { force: true });
      }
    }
    ws.close();
  } finally {
    proc.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
  console.log("Listo.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
