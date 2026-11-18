// La jornada operativa se mide en la zona horaria del negocio, no en UTC: el servidor
// corre en UTC y sin esto el día saltaba a las 19:00 hora de Colombia. De estos límites
// depende qué movimientos entran al «esperado» del inventario diario (RN-I02, RN-I03).

import { describe, expect, it } from "vitest";
import { businessDayRange, businessDayStart, toBusinessDate } from "../dates";

const BOGOTA = "America/Bogota";

describe("toBusinessDate", () => {
  it("[LIM] a las 19:00 de Colombia (00:00 UTC del día siguiente) sigue siendo el mismo día", () => {
    expect(toBusinessDate(new Date("2026-07-16T00:00:00.000Z"), BOGOTA, 0)).toBe("2026-07-15");
    expect(toBusinessDate(new Date("2026-07-16T04:59:59.999Z"), BOGOTA, 0)).toBe("2026-07-15");
  });

  it("[LIM] el día cambia a la medianoche de Colombia (05:00 UTC)", () => {
    expect(toBusinessDate(new Date("2026-07-16T05:00:00.000Z"), BOGOTA, 0)).toBe("2026-07-16");
  });

  it("respeta la zona horaria de otro cliente", () => {
    const instante = new Date("2026-07-16T03:00:00.000Z");
    expect(toBusinessDate(instante, "Europe/Madrid", 0)).toBe("2026-07-16");
    expect(toBusinessDate(instante, BOGOTA, 0)).toBe("2026-07-15");
  });
});

describe("businessDayStart y businessDayRange", () => {
  it("el día de Colombia empieza a las 05:00 UTC", () => {
    expect(businessDayStart("2026-07-15", BOGOTA, 0).toISOString()).toBe("2026-07-15T05:00:00.000Z");
  });

  it("[LIM] el rango cubre el día completo y termina un milisegundo antes del siguiente", () => {
    const { start, end } = businessDayRange("2026-07-15", BOGOTA, 0);
    expect(start.toISOString()).toBe("2026-07-15T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-16T04:59:59.999Z");
    expect(toBusinessDate(start, BOGOTA, 0)).toBe("2026-07-15");
    expect(toBusinessDate(end, BOGOTA, 0)).toBe("2026-07-15");
    expect(toBusinessDate(new Date(end.getTime() + 1), BOGOTA, 0)).toBe("2026-07-16");
  });

  it("[LIM] cruza bien fin de mes, fin de año y año bisiesto", () => {
    expect(businessDayRange("2026-01-31", BOGOTA, 0).end.toISOString()).toBe("2026-02-01T04:59:59.999Z");
    expect(businessDayRange("2026-12-31", BOGOTA, 0).end.toISOString()).toBe("2027-01-01T04:59:59.999Z");
    expect(businessDayRange("2028-02-28", BOGOTA, 0).end.toISOString()).toBe("2028-02-29T04:59:59.999Z");
  });

  it("[LIM] con horario de verano el día dura 23 o 25 horas y los límites siguen siendo la medianoche local", () => {
    // Madrid: el 29/03/2026 se adelanta el reloj (día de 23 h) y el 25/10/2026 se atrasa (25 h).
    const corto = businessDayRange("2026-03-29", "Europe/Madrid", 0);
    expect(corto.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(corto.end.getTime() - corto.start.getTime() + 1).toBe(23 * 3_600_000);

    const largo = businessDayRange("2026-10-25", "Europe/Madrid", 0);
    expect(largo.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(largo.end.getTime() - largo.start.getTime() + 1).toBe(25 * 3_600_000);
  });
});

describe("Hora de corte de la jornada (6:00 por defecto)", () => {
  it("antes de las 6:00 todavía es la jornada de la noche anterior", () => {
    // 2026-07-16 01:30 en Bogotá = 06:30 UTC.
    expect(toBusinessDate(new Date("2026-07-16T06:30:00.000Z"), BOGOTA, 6)).toBe("2026-07-15");
  });

  it("[LIM] 5:59:59.999 es de la noche anterior; 6:00 en punto ya es la jornada nueva", () => {
    expect(toBusinessDate(new Date("2026-07-16T10:59:59.999Z"), BOGOTA, 6)).toBe("2026-07-15");
    expect(toBusinessDate(new Date("2026-07-16T11:00:00.000Z"), BOGOTA, 6)).toBe("2026-07-16");
  });

  it("la jornada va de las 6:00 de su día a las 5:59:59.999 del siguiente", () => {
    const { start, end } = businessDayRange("2026-07-15", BOGOTA, 6);
    expect(start.toISOString()).toBe("2026-07-15T11:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-16T10:59:59.999Z");
    expect(toBusinessDate(start, BOGOTA, 6)).toBe("2026-07-15");
    expect(toBusinessDate(end, BOGOTA, 6)).toBe("2026-07-15");
  });

  it("[LIM] cambio de mes y de año a las 3:00 sigue en la jornada anterior", () => {
    expect(toBusinessDate(new Date("2027-01-01T08:00:00.000Z"), BOGOTA, 6)).toBe("2026-12-31");
    expect(businessDayRange("2026-12-31", BOGOTA, 6).end.toISOString()).toBe("2027-01-01T10:59:59.999Z");
  });

  it("es la hora de corte por defecto", () => {
    expect(businessDayStart("2026-07-15", BOGOTA).toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });
});
