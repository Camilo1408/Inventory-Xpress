/**
 * Props de teclado para los campos numéricos de la app.
 *
 * `inputMode="text"` a propósito, no "decimal": el teclado decimal de iOS no tiene
 * tecla "/", así que con "decimal" era IMPOSIBLE escribir fracciones ("1/2", "7 1/2")
 * desde un iPhone — y las fracciones son justo lo que estos campos aceptan. Tampoco
 * tiene "-", que hace falta para los ajustes negativos. El teclado completo los tiene
 * todos; `sanitizeNumericInput` descarta las letras que se cuelen.
 */
export const numericFieldProps = {
  type: "text",
  inputMode: "text",
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;

/**
 * Limpia el texto de un campo numérico mientras se escribe. Además de enteros y
 * decimales, admite fracciones ("1/2") y números mixtos ("7 1/2") para productos
 * que se cuentan por porciones (ej. "queda media porción" o "7 y media").
 *   - Traduce la coma decimal a punto ("1,5" → "1.5"): el teclado de iOS en es-CO
 *     ofrece "," como separador, y antes la coma se descartaba dejando "15".
 *   - Elimina cualquier carácter que no sea dígito, punto, barra o espacio.
 *   - Como máximo un punto decimal y una barra de fracción.
 *   - Colapsa espacios repetidos y descarta uno inicial.
 *   - Elimina ceros a la izquierda en la parte entera ("01" → "1", "007" → "7").
 *   - Conserva "0" solo, y "0." o "0.5" (inicio de decimal).
 *
 * Con `allowNegative` conserva un "-" inicial (ajustes de stock que descuentan).
 * Va apagado por defecto: en los conteos del inventario diario una cantidad
 * negativa no significa nada.
 */
export function sanitizeNumericInput(raw: string, opts: { allowNegative?: boolean } = {}): string {
  // La coma es separador decimal en es-CO; sin esto "1,5" se volvía "15".
  let v = raw.replace(/,/g, ".");

  const negative = opts.allowNegative === true && v.trimStart().startsWith("-");
  v = v.replace(/[^0-9. /]/g, "");

  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");

  const slash = v.indexOf("/");
  if (slash !== -1) v = v.slice(0, slash + 1) + v.slice(slash + 1).replace(/\//g, "");

  v = v.replace(/ +/g, " ").replace(/^ /, "");
  v = v.replace(/^0+([1-9])/, "$1");
  return negative ? `-${v}` : v;
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
  let v = (raw ?? "").trim();
  if (!v) return NaN;

  // El signo se resuelve aparte: las regex de fracción solo describen la magnitud.
  // Sin esto "-1/2" no casaba y caía en parseFloat, que devuelve -1 (no -0.5).
  let sign = 1;
  if (v.startsWith("-")) {
    sign = -1;
    v = v.slice(1).trim();
    if (!v) return NaN; // "-" a secas, a medio escribir
  }

  const mixed = v.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    const d = parseFloat(den);
    return d === 0 ? NaN : sign * (parseFloat(whole) + parseFloat(num) / d);
  }

  const fraction = v.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const [, num, den] = fraction;
    const d = parseFloat(den);
    return d === 0 ? NaN : sign * (parseFloat(num) / d);
  }

  return sign * parseFloat(v);
}
