/**
 * Limpia el texto de un campo numérico mientras se escribe. Además de enteros y
 * decimales, admite fracciones ("1/2") y números mixtos ("7 1/2") para productos
 * que se cuentan por porciones (ej. "queda media porción" o "7 y media").
 *   - Elimina cualquier carácter que no sea dígito, punto, barra o espacio.
 *   - Como máximo un punto decimal y una barra de fracción.
 *   - Colapsa espacios repetidos y descarta uno inicial.
 *   - Elimina ceros a la izquierda en la parte entera ("01" → "1", "007" → "7").
 *   - Conserva "0" solo, y "0." o "0.5" (inicio de decimal).
 */
export function sanitizeNumericInput(raw: string): string {
  let v = raw.replace(/[^0-9. /]/g, "");

  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");

  const slash = v.indexOf("/");
  if (slash !== -1) v = v.slice(0, slash + 1) + v.slice(slash + 1).replace(/\//g, "");

  v = v.replace(/ +/g, " ").replace(/^ /, "");
  v = v.replace(/^0+([1-9])/, "$1");
  return v;
}

/**
 * Convierte el texto de un campo numérico (ya sanitizado por
 * `sanitizeNumericInput`) a `number`, admitiendo:
 *   - Decimal normal: "7", "7.5"
 *   - Fracción simple: "1/2" → 0.5
 *   - Número mixto: "7 1/2" → 7.5
 * Devuelve NaN si el texto no es interpretable, igual que `parseFloat`.
 */
export function parseNumericValue(raw: string | undefined | null): number {
  const v = (raw ?? "").trim();
  if (!v) return NaN;

  const mixed = v.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    const d = parseFloat(den);
    return d === 0 ? NaN : parseFloat(whole) + parseFloat(num) / d;
  }

  const fraction = v.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const [, num, den] = fraction;
    const d = parseFloat(den);
    return d === 0 ? NaN : parseFloat(num) / d;
  }

  return parseFloat(v);
}
