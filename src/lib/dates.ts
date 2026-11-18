// src/lib/dates.ts
// Fechas de la jornada operativa en la zona horaria del negocio.
//
// La jornada NO empieza a medianoche: empieza a `config.dayStartHour` (6:00 por defecto).
// Un movimiento registrado a la 1:00 pertenece a la jornada de la noche anterior.
//
// El servidor (Vercel) corre en UTC. Calcular el día con `new Date().toISOString()`
// hacía que la jornada saltara al día siguiente a las 19:00 hora de Colombia, en plena
// operación. Todo cálculo de "hoy" y de los límites de un día debe pasar por aquí.

import { config } from "@/lib/config";

const HOUR_MS = 3_600_000;

/**
 * Jornada "YYYY-MM-DD" a la que pertenece un instante, en la zona horaria del negocio.
 * Antes de la hora de corte, el instante es todavía de la jornada del día anterior.
 */
export function toBusinessDate(
  instant: Date = new Date(),
  tz: string = config.timezone,
  startHour: number = config.dayStartHour,
): string {
  // en-CA formatea como YYYY-MM-DD.
  const shifted = new Date(instant.getTime() - startHour * HOUR_MS);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/** El día operativo actual, "YYYY-MM-DD" en la zona horaria del negocio. */
export function businessToday(tz: string = config.timezone, startHour: number = config.dayStartHour): string {
  return toBusinessDate(new Date(), tz, startHour);
}

/** Milisegundos que `tz` está adelantada respecto a UTC en ese instante. */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);

  const v: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") v[p.type] = Number(p.value);

  const asIfUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return asIfUtc - instant.getTime();
}

/**
 * Instante UTC en que empieza la jornada `date` ("YYYY-MM-DD") en la zona del negocio:
 * ese día a la hora de corte.
 * Ej.: "2026-07-15" en America/Bogota con corte a las 6:00 → 2026-07-15T11:00:00.000Z.
 */
export function businessDayStart(
  date: string,
  tz: string = config.timezone,
  startHour: number = config.dayStartHour,
): Date {
  const [y, m, d] = date.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Dos pasadas: la primera puede caer del lado equivocado de un cambio de horario
  // (Colombia no tiene DST, pero otros clientes podrían).
  let start = utcGuess - tzOffsetMs(new Date(utcGuess), tz);
  start = utcGuess - tzOffsetMs(new Date(start), tz);
  return new Date(start + startHour * HOUR_MS);
}

/** Rango [inicio, fin] en UTC que cubre el día `date` completo en la zona del negocio. */
export function businessDayRange(
  date: string,
  tz: string = config.timezone,
  startHour: number = config.dayStartHour,
): { start: Date; end: Date } {
  const start = businessDayStart(date, tz, startHour);
  const end = new Date(businessDayStart(nextDate(date), tz, startHour).getTime() - 1);
  return { start, end };
}

/** El día siguiente a "YYYY-MM-DD", en formato "YYYY-MM-DD". */
function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}
