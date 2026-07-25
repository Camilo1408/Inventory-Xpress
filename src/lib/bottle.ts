// src/lib/bottle.ts
// Control de licores por nivel de botella (subcategoría Cócteles).
// Lógica pura: sin dependencias de React/Prisma para poder testearse aislada.

import { config } from "./config";

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

/** ¿La subcategoría con este slug se controla por nivel de botella?
 *  Si el feature flag de cócteles está apagado para esta instancia, siempre false
 *  (oculta toda la UI y omite la lógica de botella en un solo punto). */
export function isBottleTrackedSlug(slug: string | null | undefined): boolean {
  if (!config.features.cocktails) return false;
  return !!slug && BOTTLE_TRACKING_SLUGS.includes(slug);
}

/**
 * Stock total disponible de un licor de cócteles:
 *   botellas en reserva + 1 si existe botella abierta con contenido (bottleLevel != null).
 * Cualquier nivel registrado (incluso "almost_empty") significa que hay contenido.
 * null = sin botella abierta = no suma al total.
 */
export function bottleStock(
  level: string | null | undefined,
  reserve: number | null | undefined
): number {
  const openBottle = level != null ? 1 : 0;
  return (reserve ?? 0) + openBottle;
}

/**
 * Reparte una entrada de N botellas cerradas sobre el estado actual del producto:
 *   - Si NO hay botella abierta ni reserva (level == null && reserva == 0), se
 *     destapa una botella "Llena" y las restantes van a la reserva.
 *   - En cualquier otro caso (hay botella abierta con estado, o ya hay reserva),
 *     todo suma a la reserva y la botella abierta no se toca.
 * qty se asume entero positivo (la ruta ya lo normaliza).
 */
export function addBottleEntry(
  level: BottleLevel | null | undefined,
  reserve: number | null | undefined,
  qty: number
): { level: BottleLevel | null; reserve: number } {
  const r = reserve ?? 0;
  if (level == null && r === 0) {
    return { level: "full", reserve: qty - 1 };
  }
  return { level: level ?? null, reserve: r + qty };
}

/**
 * Transición al marcar la botella abierta como vacía/consumida:
 *   - Si hay botellas en reserva, se destapa una nueva: reserva − 1 y nivel "full".
 *   - Si no hay reserva, queda sin botella abierta (nivel null) → stock 0.
 */
export function emptyOpenBottle(
  reserve: number | null | undefined
): { level: BottleLevel | null; reserve: number } {
  const r = reserve ?? 0;
  if (r > 0) return { level: "full", reserve: r - 1 };
  return { level: null, reserve: 0 };
}

// ─── Indicador shots/copeo ──────────────────────────────────────────────────
// Un único indicador booleano (no dos estados): la botella está marcada para
// shots/copeo, o no lo está. Solo aplica a las subcategorías Licores y Vinos
// (no a Cócteles, que ya tiene su propio control por nivel de botella). Se
// activa/desactiva al abrir o cerrar el inventario diario.

export const SHOTS_COPEO_SLUGS: readonly string[] = ["licores", "vinos"];

/** ¿La subcategoría con este slug admite el indicador shots/copeo? */
export function isShotsCopeoTrackedSlug(slug: string | null | undefined): boolean {
  if (!config.features.cocktails) return false;
  return !!slug && SHOTS_COPEO_SLUGS.includes(slug);
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
