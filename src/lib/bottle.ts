// src/lib/bottle.ts
// Control de licores por nivel de botella (subcategoría Cócteles).
// Lógica pura: sin dependencias de React/Prisma para poder testearse aislada.

export type BottleLevel =
  | "full"
  | "three_quarters"
  | "half"
  | "quarter"
  | "almost_empty";

/** Slugs de subcategoría cuyos productos se controlan por nivel de botella. */
export const BOTTLE_TRACKING_SLUGS: readonly string[] = ["cocteles"];

/** Nivel de alerta por defecto cuando el producto no define uno propio. */
export const DEFAULT_ALERT_LEVEL: BottleLevel = "almost_empty";

interface BottleLevelDef {
  key: BottleLevel;
  label: string;
  order: number;
  /** Clase del badge de estado (lectura). */
  badgeClass: string;
  /** Clase del punto/segmento de color (selector). */
  dotClass: string;
}

/** Niveles ordenados de lleno (5) a casi vacío (1). El orden es la fuente de verdad. */
export const BOTTLE_LEVELS: readonly BottleLevelDef[] = [
  { key: "full",           label: "Llena",      order: 5, badgeClass: "bg-emerald-100 text-emerald-700", dotClass: "bg-emerald-500" },
  { key: "three_quarters", label: "3/4",        order: 4, badgeClass: "bg-emerald-100 text-emerald-700", dotClass: "bg-emerald-500" },
  { key: "half",           label: "Mitad",      order: 3, badgeClass: "bg-amber-100 text-amber-700",     dotClass: "bg-amber-500" },
  { key: "quarter",        label: "1/4",        order: 2, badgeClass: "bg-orange-100 text-orange-700",   dotClass: "bg-orange-500" },
  { key: "almost_empty",   label: "Casi vacía", order: 1, badgeClass: "bg-red-100 text-red-700",         dotClass: "bg-red-500" },
];

const LEVEL_BY_KEY = new Map<BottleLevel, BottleLevelDef>(
  BOTTLE_LEVELS.map((l) => [l.key, l])
);

export function isBottleLevel(v: unknown): v is BottleLevel {
  return typeof v === "string" && LEVEL_BY_KEY.has(v as BottleLevel);
}

export function bottleLevelMeta(level: BottleLevel): BottleLevelDef {
  const meta = LEVEL_BY_KEY.get(level);
  if (!meta) throw new Error(`Nivel de botella desconocido: ${level}`);
  return meta;
}

export function bottleLevelOrder(level: BottleLevel): number {
  return bottleLevelMeta(level).order;
}

/** ¿La subcategoría con este slug se controla por nivel de botella? */
export function isBottleTrackedSlug(slug: string | null | undefined): boolean {
  return !!slug && BOTTLE_TRACKING_SLUGS.includes(slug);
}

/**
 * Regla de alerta de compra:
 *   orden(nivel) <= orden(umbral ?? default)  Y  (reserva ?? 0) === 0
 * Un producto sin nivel registrado (null) nunca alerta.
 */
export function needsRestock(
  level: BottleLevel | null | undefined,
  reserve: number | null | undefined,
  alertLevel: BottleLevel | null | undefined
): boolean {
  if (!isBottleLevel(level)) return false;
  const threshold = isBottleLevel(alertLevel) ? alertLevel : DEFAULT_ALERT_LEVEL;
  const hasReserve = (reserve ?? 0) > 0;
  return bottleLevelOrder(level) <= bottleLevelOrder(threshold) && !hasReserve;
}
