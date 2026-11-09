// RN-I04: stock de un licor = botellas en reserva + 1 si hay botella abierta con contenido;
// con el flag de cócteles apagado el control por botella no aplica.

import { beforeEach, describe, expect, it, vi } from "vitest";

const features = vi.hoisted(() => ({ cocktails: true }));
vi.mock("../config", () => ({ config: { features } }));

import {
  BOTTLE_LEVELS,
  addBottleEntry,
  bottleLevelOrder,
  bottleStock,
  emptyOpenBottle,
  isBottleLevel,
  isBottleTrackedSlug,
  isShotsCopeoTrackedSlug,
  needsRestock,
} from "../bottle";

beforeEach(() => {
  features.cocktails = true;
});

describe("bottleStock", () => {
  it("[RN-I04] suma la reserva y 1 por la botella abierta, sea cual sea su nivel", () => {
    for (const { key } of BOTTLE_LEVELS) expect(bottleStock(key, 2)).toBe(3);
    expect(bottleStock("almost_empty", 0)).toBe(1);
  });

  it("[RN-I04] sin botella abierta solo cuenta la reserva", () => {
    expect(bottleStock(null, 4)).toBe(4);
    expect(bottleStock(undefined, 4)).toBe(4);
  });

  it("[LIM] sin botella ni reserva el stock es 0; una reserva nula cuenta como 0", () => {
    expect(bottleStock(null, 0)).toBe(0);
    expect(bottleStock(null, null)).toBe(0);
    expect(bottleStock("full", undefined)).toBe(1);
  });
});

describe("addBottleEntry", () => {
  it("[RN-I04] sin botella ni reserva, destapa una llena y el resto va a la reserva", () => {
    expect(addBottleEntry(null, 0, 3)).toEqual({ level: "full", reserve: 2 });
    expect(addBottleEntry(null, null, 1)).toEqual({ level: "full", reserve: 0 });
  });

  it("[RN-I04] con botella abierta, todo suma a la reserva y el nivel no cambia", () => {
    expect(addBottleEntry("quarter", 1, 2)).toEqual({ level: "quarter", reserve: 3 });
  });

  it("[LIM] con reserva pero sin botella abierta, no destapa: solo suma a la reserva", () => {
    expect(addBottleEntry(null, 2, 1)).toEqual({ level: null, reserve: 3 });
  });

  it("[RN-I04] la entrada siempre aumenta el stock en la cantidad recibida", () => {
    const casos: Array<[Parameters<typeof addBottleEntry>[0], number]> = [[null, 0], [null, 3], ["half", 0], ["full", 5]];
    for (const [level, reserve] of casos) {
      for (const qty of [1, 2, 7]) {
        const next = addBottleEntry(level, reserve, qty);
        expect(bottleStock(next.level, next.reserve)).toBe(bottleStock(level, reserve) + qty);
      }
    }
  });
});

describe("emptyOpenBottle", () => {
  it("[RN-I04] con reserva, destapa la siguiente: el stock baja exactamente 1", () => {
    expect(emptyOpenBottle(2)).toEqual({ level: "full", reserve: 1 });
    expect(bottleStock("full", 1)).toBe(bottleStock("almost_empty", 2) - 1);
  });

  it("[LIM] sin reserva queda sin botella abierta y con stock 0", () => {
    expect(emptyOpenBottle(0)).toEqual({ level: null, reserve: 0 });
    expect(emptyOpenBottle(null)).toEqual({ level: null, reserve: 0 });
  });
});

describe("needsRestock (RN-I06)", () => {
  it("[RN-I06] alerta cuando el nivel llega al umbral y no hay reserva", () => {
    expect(needsRestock("quarter", 0, "quarter")).toBe(true);
    expect(needsRestock("almost_empty", 0, "quarter")).toBe(true);
    expect(needsRestock("half", 0, "quarter")).toBe(false);
  });

  it("[RN-I06] con botellas en reserva nunca alerta", () => {
    expect(needsRestock("almost_empty", 1, "full")).toBe(false);
  });

  it("[LIM] sin umbral propio usa «casi vacía»; sin botella registrada no alerta", () => {
    expect(needsRestock("almost_empty", 0, null)).toBe(true);
    expect(needsRestock("quarter", 0, null)).toBe(false);
    expect(needsRestock("quarter", 0, "valor-raro" as never)).toBe(false);
    expect(needsRestock(null, 0, "full")).toBe(false);
  });
});

describe("niveles y subcategorías", () => {
  it("los niveles van de 5 (llena) a 1 (casi vacía), sin repetir", () => {
    expect(BOTTLE_LEVELS.map((l) => l.order)).toEqual([5, 4, 3, 2, 1]);
    expect(bottleLevelOrder("full")).toBeGreaterThan(bottleLevelOrder("almost_empty"));
  });

  it("[NEG] isBottleLevel rechaza valores desconocidos", () => {
    expect(isBottleLevel("half")).toBe(true);
    for (const v of ["HALF", "empty", "", null, undefined, 3]) expect(isBottleLevel(v)).toBe(false);
  });

  it("[RN-I04] solo «cocteles» se controla por botella, y solo «licores» y «vinos» llevan shots/copeo", () => {
    expect(isBottleTrackedSlug("cocteles")).toBe(true);
    expect(isBottleTrackedSlug("licores")).toBe(false);
    expect(isBottleTrackedSlug(null)).toBe(false);
    expect(isShotsCopeoTrackedSlug("licores")).toBe(true);
    expect(isShotsCopeoTrackedSlug("vinos")).toBe(true);
    expect(isShotsCopeoTrackedSlug("cocteles")).toBe(false);
  });

  it("[RN-I04] con el flag de cócteles apagado nada se controla por botella", () => {
    features.cocktails = false;
    expect(isBottleTrackedSlug("cocteles")).toBe(false);
    expect(isShotsCopeoTrackedSlug("licores")).toBe(false);
  });
});
