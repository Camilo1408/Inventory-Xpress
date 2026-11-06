import { NextResponse } from "next/server";
import { z } from "zod";

// Mensajes de Zod en español (los que no tienen un mensaje propio en el schema).
z.config(z.locales.es());

/**
 * Lectura y validación del cuerpo de las peticiones (I-1 del Plan de Calidad).
 *
 * Antes cada ruta hacía `await req.json() as {...}`: el `as` no valida nada, así que
 * un cuerpo vacío, mal formado, `null` o con un campo del tipo equivocado (p. ej.
 * `name: 5` y luego `name.trim()`) terminaba en un 500. Ahora:
 *   - JSON vacío o mal formado → 400 "El cuerpo de la petición no es JSON válido";
 *   - tipos equivocados        → 400 con el mensaje de la ruta (o el del primer campo
 *                                inválido, si la ruta no da uno) y los campos (`fields`).
 *
 * Los schemas solo fijan los TIPOS: las reglas de negocio (requeridos, rangos, permisos)
 * siguen en cada ruta, con sus mensajes y en su mismo orden.
 */

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export const INVALID_JSON_MESSAGE = "El cuerpo de la petición no es JSON válido";

/** Valida un valor ya leído (p. ej. un arreglo anidado del cuerpo). */
export function parseValue<S extends z.ZodType>(
  schema: S,
  value: unknown,
  message?: string,
): Parsed<z.output<S>> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const fields = [...new Set(result.error.issues.map((i) => i.path.join(".") || "(cuerpo)"))];
  const error = message ?? result.error.issues[0]?.message ?? "Datos inválidos";
  return { ok: false, response: NextResponse.json({ error, fields }, { status: 400 }) };
}

/** Lee el cuerpo JSON y lo valida contra `schema`. Nunca lanza. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  message?: string,
): Promise<Parsed<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 }) };
  }
  return parseValue(schema, raw, message);
}
