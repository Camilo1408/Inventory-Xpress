// I-H1b: en modo integrated el inventario pregunta a Nómina si la sesión sigue
// vigente (RN-19 de Nómina) y por los permisos actuales.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { decode, type JWT } from "next-auth/jwt";
import {
  applyNominaSession,
  clearSessionCheckCache,
  fetchNominaSessionState,
  SESSION_CHECK_SALT,
  SESSION_CHECK_TTL_MS,
} from "../session-check";

const SECRET = "secreto-de-prueba-de-32-caracteres!!";
const VALID = {
  valid: true,
  role: "EMPLOYEE",
  inventoryAccess: true,
  inventoryPermissions: ["inventory:view", "inventory:daily:bar:view"],
};

let clock = 1_000_000;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function deps(respond: (req: { url: string; init: RequestInit }) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    respond({ url: String(url), init: init ?? {} }),
  );
  return {
    fetchMock,
    deps: {
      fetch: fetchMock as unknown as typeof fetch,
      now: () => clock,
      nominaUrl: "https://nomina.example.com/",
      secret: SECRET,
    },
  };
}

const sessionToken = (): JWT => ({
  sub: "u1",
  id: "u1",
  username: "cajero",
  tenantId: "t1",
  sv: 2,
  role: "ADMIN",
  inventoryAccess: true,
  inventoryPermissions: ["inventory:view", "inventory:products:edit"],
});

beforeEach(() => {
  clearSessionCheckCache();
  clock = 1_000_000;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("fetchNominaSessionState", () => {
  it("envía a Nómina un token corto cifrado con la sal propia (no la de la cookie)", async () => {
    const { deps: d, fetchMock } = deps(() => json(VALID));
    await fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://nomina.example.com/api/inventory-permissions/session");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    const bearer = String((init?.headers as Record<string, string>).authorization).replace("Bearer ", "");
    const claims = await decode({ token: bearer, secret: SECRET, salt: SESSION_CHECK_SALT });
    expect(claims).toMatchObject({ id: "u1", tenantId: "t1", sv: 2 });
    expect((claims?.exp as number) - (claims?.iat as number)).toBeLessThanOrEqual(120);
    await expect(decode({ token: bearer, secret: SECRET, salt: "__Secure-nx.session-token" })).rejects.toThrow();
  });

  it("[LIM] reutiliza la respuesta durante 1 minuto por sesión y luego vuelve a preguntar", async () => {
    const { deps: d, fetchMock } = deps(() => json(VALID));
    await fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d);
    clock += SESSION_CHECK_TTL_MS - 1;
    await fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += 2;
    await fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("una versión de sesión distinta no usa la caché de la anterior", async () => {
    const { deps: d, fetchMock } = deps(() => json(VALID));
    await fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d);
    await fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 3 }, d);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("[NEG] falla abierta: Nómina caído ⇒ null y no queda en caché", async () => {
    let down = true;
    const { deps: d, fetchMock } = deps(() => {
      if (down) throw new Error("ECONNREFUSED");
      return json(VALID);
    });
    await expect(fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d)).resolves.toBeNull();
    down = false;
    await expect(fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d)).resolves.toEqual(VALID);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("[NEG] un Nómina sin el endpoint (redirige a /login) ⇒ null", async () => {
    const { deps: d } = deps(() => new Response(null, { status: 307, headers: { location: "/login" } }));
    await expect(fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, d)).resolves.toBeNull();
  });

  it("[NEG] 200 que no es JSON, o JSON con otro formato ⇒ null", async () => {
    const html = deps(() => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, html.deps)).resolves.toBeNull();
    clearSessionCheckCache();
    const odd = deps(() => json({ valid: true, role: "ADMIN", inventoryPermissions: "todo" }));
    await expect(fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, odd.deps)).resolves.toBeNull();
  });

  it("[NEG] sin NOMINA_APP_URL ⇒ null sin llamar a nadie", async () => {
    const { deps: d, fetchMock } = deps(() => json(VALID));
    await expect(
      fetchNominaSessionState({ id: "u1", tenantId: "t1", sv: 2 }, { ...d, nominaUrl: undefined }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("applyNominaSession", () => {
  it("[RN-19] sesión revocada en Nómina ⇒ null (el inventario cierra la sesión)", async () => {
    const { deps: d } = deps(() => json({ valid: false }));
    await expect(applyNominaSession(sessionToken(), d)).resolves.toBeNull();
  });

  it("sesión vigente ⇒ refresca rol y permisos sin volver a iniciar sesión", async () => {
    const { deps: d } = deps(() => json(VALID));
    const out = await applyNominaSession(sessionToken(), d);
    expect(out).toMatchObject({
      sub: "u1",
      role: "EMPLOYEE",
      inventoryAccess: true,
      inventoryPermissions: ["inventory:view", "inventory:daily:bar:view"],
    });
  });

  it("[NEG] Nómina sin responder ⇒ el token sigue como estaba", async () => {
    const { deps: d } = deps(() => {
      throw new Error("timeout");
    });
    const token = sessionToken();
    await expect(applyNominaSession(token, d)).resolves.toEqual(sessionToken());
  });

  it("usa sub si el token no trae id; sin tenantId no consulta", async () => {
    const { deps: d, fetchMock } = deps(() => json(VALID));
    const { id: _id, ...noId } = sessionToken();
    void _id;
    await applyNominaSession(noId as JWT, d);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { tenantId: _t, ...noTenant } = sessionToken();
    void _t;
    await expect(applyNominaSession(noTenant as unknown as JWT, d)).resolves.toEqual(noTenant);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
