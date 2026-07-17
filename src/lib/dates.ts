// src/lib/dates.ts
// Fechas de la jornada operativa en la zona horaria del negocio.
//
// El servidor (Vercel) corre en UTC. Calcular el día con `new Date().toISOString()`
// hacía que la jornada saltara al día siguiente a las 19:00 hora de Colombia, en plena
// operación. Todo cálculo de "hoy" y de los límites de un día debe pasar por aquí.

import { config } from "@/lib/config";

/** Fecha "YYYY-MM-DD" de un instante, leída en la zona horaria del negocio. */
export function toBusinessDate(instant: Date = new Date(), tz: string = config.timezone): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** El día operativo actual, "YYYY-MM-DD" en la zona horaria del negocio. */
export function businessToday(tz: string = config.timezone): string {
  return toBusinessDate(new Date(), tz);
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
 * Instante UTC en que empieza el día `date` ("YYYY-MM-DD") en la zona del negocio.
 * Ej.: "2026-07-15" en America/Bogota → 2026-07-15T05:00:00.000Z.
 */
export function businessDayStart(date: string, tz: string = config.timezone): Date {
  const [y, m, d] = date.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Dos pasadas: la primera puede caer del lado equivocado de un cambio de horario
  // (Colombia no tiene DST, pero otros clientes podrían).
  let start = utcGuess - tzOffsetMs(new Date(utcGuess), tz);
  start = utcGuess - tzOffsetMs(new Date(start), tz);
  return new Date(start);
}

/** Rango [inicio, fin] en UTC que cubre el día `date` completo en la zona del negocio. */
export function businessDayRange(date: string, tz: string = config.timezone): { start: Date; end: Date } {
  const start = businessDayStart(date, tz);
  const end = new Date(businessDayStart(nextDate(date), tz).getTime() - 1);
  return { start, end };
}

/** El día siguiente a "YYYY-MM-DD", en formato "YYYY-MM-DD". */
function nextDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}
