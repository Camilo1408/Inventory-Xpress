/**
 * Limpia el texto de un campo numérico:
 *   - Elimina cualquier carácter que no sea dígito o punto decimal.
 *   - Descarta puntos decimales adicionales (solo el primero es válido).
 *   - Elimina ceros a la izquierda en la parte entera ("01" → "1", "007" → "7").
 *   - Conserva "0" solo, y "0." o "0.5" (inicio de decimal).
 */
export function sanitizeNumericInput(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
  v = v.replace(/^0+([1-9])/, "$1");
  return v;
}
