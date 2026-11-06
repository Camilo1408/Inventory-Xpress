// Verificación de la sesión contra Nómina Xpress (modo integrated, I-H1b).
//
// El inventario lee la cookie de sesión que emite Nómina, pero no tiene su base de
// datos. Sin esta consulta, una sesión revocada en Nómina (usuario desactivado,
// contraseña o rol cambiados) seguía abriendo el inventario hasta 12 h, y los
// permisos de inventario quedaban congelados mientras el usuario no volviera a
// Nómina. Aquí le preguntamos a Nómina, como mucho una vez por minuto por sesión:
//
//   POST ${NOMINA_APP_URL}/api/inventory-permissions/session
//   Authorization: Bearer <JWE de 2 min con { id, tenantId, sv }>
//
// La consulta va cifrada con el NEXTAUTH_SECRET compartido y una sal propia, que
// DEBE ser idéntica a SESSION_CHECK_SALT de Nómina (src/lib/session-state.ts).
//
// Falla abierta: si Nómina no responde o responde algo inesperado (un Nómina sin
// este endpoint redirige a /login), la sesión sigue con lo que ya traía el JWT y
// queda un aviso en el log. Solo una respuesta explícita { valid: false } la cierra.

import { encode, type JWT } from "next-auth/jwt";

export const SESSION_CHECK_SALT = "nx.inventory-session-check";
export const SESSION_CHECK_TTL_MS = 60_000;
const REQUEST_MAX_AGE_SECONDS = 120;
const TIMEOUT_MS = 3_000;
const MAX_CACHE_ENTRIES = 1_000;

export type NominaSessionState =
  | { valid: false }
  | { valid: true; role: string; inventoryAccess: boolean; inventoryPermissions: string[] };

type Deps = {
  fetch: typeof fetch;
  now: () => number;
  nominaUrl: string | undefined;
  secret: string | undefined;
};

const defaultDeps = (): Deps => ({
  fetch: globalThis.fetch,
  now: Date.now,
  nominaUrl: process.env.NOMINA_APP_URL?.trim(),
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
});

const cache = new Map<string, { state: NominaSessionState; at: number }>();

/** Solo para pruebas. */
export function clearSessionCheckCache() {
  cache.clear();
}

function parseState(body: unknown): NominaSessionState | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.valid === false) return { valid: false };
  if (
    b.valid === true &&
    typeof b.role === "string" &&
    typeof b.inventoryAccess === "boolean" &&
    Array.isArray(b.inventoryPermissions) &&
    b.inventoryPermissions.every((k) => typeof k === "string")
  ) {
    return {
      valid: true,
      role: b.role,
      inventoryAccess: b.inventoryAccess,
      inventoryPermissions: b.inventoryPermissions as string[],
    };
  }
  return null;
}

/**
 * Pregunta a Nómina por la sesión. Devuelve null si no se pudo saber (falla abierta).
 */
export async function fetchNominaSessionState(
  claims: { id: string; tenantId: string; sv: unknown },
  deps: Deps = defaultDeps(),
): Promise<NominaSessionState | null> {
  if (!deps.nominaUrl || !deps.secret) {
    console.warn("[session-check] Falta NOMINA_APP_URL o NEXTAUTH_SECRET: sesión sin verificar");
    return null;
  }

  const key = `${claims.tenantId}|${claims.id}|${String(claims.sv)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < SESSION_CHECK_TTL_MS) return hit.state;

  try {
    const bearer = await encode({
      token: { id: claims.id, tenantId: claims.tenantId, sv: claims.sv },
      secret: deps.secret,
      salt: SESSION_CHECK_SALT,
      maxAge: REQUEST_MAX_AGE_SECONDS,
    });
    const res = await deps.fetch(`${deps.nominaUrl.replace(/\/+$/, "")}/api/inventory-permissions/session`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}` },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    if (res.status !== 200 || !isJson) {
      console.warn(`[session-check] Nómina respondió ${res.status}: sesión sin verificar`);
      return null;
    }
    const state = parseState(await res.json());
    if (!state) {
      console.warn("[session-check] Respuesta de Nómina con otro formato: sesión sin verificar");
      return null;
    }
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(key, { state, at: deps.now() });
    return state;
  } catch (err) {
    console.warn(`[session-check] Nómina no respondió: sesión sin verificar (${(err as Error).message})`);
    return null;
  }
}

/**
 * Aplica el estado de Nómina al token del inventario: null cierra la sesión; si es
 * vigente, refresca rol y permisos; si no se pudo saber, deja el token como está.
 */
export async function applyNominaSession(token: JWT, deps?: Deps): Promise<JWT | null> {
  const id = (token.id as string | undefined) ?? token.sub;
  const tenantId = token.tenantId as string | undefined;
  if (!id || !tenantId) return token;

  const state = await fetchNominaSessionState({ id, tenantId, sv: token.sv }, deps);
  if (!state) return token;
  if (!state.valid) return null;
  token.role = state.role;
  token.inventoryAccess = state.inventoryAccess;
  token.inventoryPermissions = state.inventoryPermissions;
  return token;
}
