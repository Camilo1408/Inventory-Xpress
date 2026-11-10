// RN-I05: los campos numéricos aceptan decimales con coma, fracciones («1/2») y
// números mixtos («7 1/2»), y rechazan lo demás.

import { describe, expect, it } from "vitest";
import { parseNumericValue, sanitizeNumericInput } from "../numeric";

describe("parseNumericValue", () => {
  it.each([
    ["7", 7],
    ["7.5", 7.5],
    ["0", 0],
    ["1/2", 0.5],
    ["3/4", 0.75],
    ["7 1/2", 7.5],
    ["10  1/4", 10.25],
    [" 2 ", 2],
  ])("[RN-I05] «%s» ⇒ %d", (texto, esperado) => {
    expect(parseNumericValue(texto)).toBe(esperado);
  });

  it.each([
    ["-3", -3],
    ["-1/2", -0.5],
    ["-7 1/2", -7.5],
    ["- 2", -2],
  ])("[RN-I05] el signo se aplica a toda la cantidad: «%s» ⇒ %d", (texto, esperado) => {
    expect(parseNumericValue(texto)).toBe(esperado);
  });

  it.each([[""], ["   "], ["-"], [null], [undefined], ["abc"], ["1/0"], ["7 1/0"]])(
    "[NEG] «%s» no es una cantidad ⇒ NaN",
    (texto) => {
      expect(parseNumericValue(texto)).toBeNaN();
    }
  );
});

describe("sanitizeNumericInput", () => {
  it("[RN-I05] la coma decimal se traduce a punto (antes «1,5» se volvía 15)", () => {
    expect(sanitizeNumericInput("1,5")).toBe("1.5");
    expect(parseNumericValue(sanitizeNumericInput("1,5"))).toBe(1.5);
  });

  it("[RN-I05] conserva fracciones y números mixtos", () => {
    expect(sanitizeNumericInput("1/2")).toBe("1/2");
    expect(sanitizeNumericInput("7 1/2")).toBe("7 1/2");
    expect(sanitizeNumericInput("7   1/2")).toBe("7 1/2");
  });

  it("[NEG] descarta letras y símbolos", () => {
    expect(sanitizeNumericInput("12kg")).toBe("12");
    expect(sanitizeNumericInput("$1.200")).toBe("1.200");
    expect(sanitizeNumericInput("abc")).toBe("");
  });

  it("[LIM] como máximo un punto y una barra", () => {
    expect(sanitizeNumericInput("1.2.3")).toBe("1.23");
    expect(sanitizeNumericInput("1/2/3")).toBe("1/23");
  });

  it("[LIM] quita ceros a la izquierda pero conserva «0» y «0.5»", () => {
    expect(sanitizeNumericInput("007")).toBe("7");
    expect(sanitizeNumericInput("0")).toBe("0");
    expect(sanitizeNumericInput("0.5")).toBe("0.5");
  });

  it("[RN-I05] el signo negativo solo se conserva si el campo lo admite", () => {
    expect(sanitizeNumericInput("-3")).toBe("3");
    expect(sanitizeNumericInput("-3", { allowNegative: true })).toBe("-3");
    expect(sanitizeNumericInput("3-1", { allowNegative: true })).toBe("31");
    expect(parseNumericValue(sanitizeNumericInput("-1/2", { allowNegative: true }))).toBe(-0.5);
  });
});
