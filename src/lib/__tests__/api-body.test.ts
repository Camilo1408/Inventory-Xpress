// I-1: lectura y validación del cuerpo de las peticiones.

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { INVALID_JSON_MESSAGE, parseBody, parseValue } from "../api-body";

const req = (body?: string) => new Request("http://localhost/api/x", { method: "POST", body });
const schema = z.object({
  name: z.string().optional(),
  quantity: z.number({ error: "Cantidad inválida" }).optional(),
});

describe("parseBody", () => {
  it("cuerpo válido ⇒ datos tipados, sin las claves desconocidas", async () => {
    await expect(parseBody(req('{"name":"Ron","otra":1}'), schema)).resolves.toEqual({
      ok: true,
      data: { name: "Ron" },
    });
  });

  it("[LIM] las claves opcionales ausentes no aparecen (products/[id] cuenta las claves)", async () => {
    const r = await parseBody(req('{"name":"Ron"}'), schema);
    expect(r.ok && Object.keys(r.data)).toEqual(["name"]);
  });

  it("[NEG] JSON mal formado o vacío ⇒ 400, nunca lanza", async () => {
    for (const body of ["{roto", undefined]) {
      const r = await parseBody(req(body), schema);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.response.status).toBe(400);
        await expect(r.response.json()).resolves.toEqual({ error: INVALID_JSON_MESSAGE });
      }
    }
  });

  it("[NEG] cuerpo `null` o un arreglo ⇒ 400 (antes `body.x` lanzaba un 500)", async () => {
    for (const body of ["null", "[]"]) {
      const r = await parseBody(req(body), schema);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(400);
    }
  });

  it("[NEG] tipo equivocado ⇒ 400 con el mensaje del campo y la lista de campos", async () => {
    const r = await parseBody(req('{"quantity":"diez"}'), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) await expect(r.response.json()).resolves.toEqual({ error: "Cantidad inválida", fields: ["quantity"] });
  });

  it("[NEG] sin mensaje propio, el mensaje de Zod sale en español", async () => {
    const r = await parseBody(req('{"name":5}'), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(body.fields).toEqual(["name"]);
      expect(body.error).toMatch(/se esperaba texto/);
    }
  });

  it("[NEG] el mensaje de la ruta tiene prioridad", async () => {
    const r = await parseBody(req('{"name":5}'), schema, "Datos inválidos");
    expect(r.ok).toBe(false);
    if (!r.ok) await expect(r.response.json()).resolves.toMatchObject({ error: "Datos inválidos" });
  });
});

describe("parseValue", () => {
  it("[NEG] un elemento `null` dentro de un arreglo ⇒ 400 con su posición", async () => {
    const r = parseValue(z.array(z.object({ productId: z.string() })), [{ productId: "a" }, null], "Datos inválidos en items");
    expect(r.ok).toBe(false);
    if (!r.ok) await expect(r.response.json()).resolves.toEqual({ error: "Datos inválidos en items", fields: ["1"] });
  });
});
