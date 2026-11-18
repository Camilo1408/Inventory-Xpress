import { describe, expect, it } from "vitest";
import { paginate } from "../pagination";

const lista = Array.from({ length: 45 }, (_, i) => i + 1);

describe("paginate", () => {
  it("corta la lista en páginas del tamaño pedido", () => {
    expect(paginate(lista, 1, 20)).toMatchObject({ items: lista.slice(0, 20), page: 1, totalPages: 3, total: 45, start: 0 });
    expect(paginate(lista, 3, 20)).toMatchObject({ items: [41, 42, 43, 44, 45], start: 40 });
  });

  it("[LIM] una página fuera de rango se acota: un filtro que reduce la lista no deja una página vacía", () => {
    expect(paginate(lista, 9, 20).page).toBe(3);
    expect(paginate(lista.slice(0, 5), 3, 20)).toMatchObject({ page: 1, items: [1, 2, 3, 4, 5] });
    expect(paginate(lista, 0, 20).page).toBe(1);
  });

  it("[LIM] una lista vacía tiene una sola página, sin filas", () => {
    expect(paginate([], 1, 20)).toMatchObject({ items: [], page: 1, totalPages: 1, total: 0 });
  });

  it("[LIM] el tamaño exacto de una página no crea una segunda", () => {
    expect(paginate(lista.slice(0, 20), 1, 20).totalPages).toBe(1);
  });
});
