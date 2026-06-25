// src/lib/category-order.ts
// Orden curado de categorías raíz y subcategorías según los inventarios físicos
// (archivos "## INVENTARIO DE BARRA.txt" y "## Inventario de Cocina.txt").
// El número es un orden GLOBAL en orden de documento: raíz, luego sus subcategorías,
// luego la siguiente raíz. Productos se ordenan por el sortOrder de su (sub)categoría.

/** Mapa nombre de categoría → sortOrder. Las no listadas usan FALLBACK_ORDER. */
export const CATEGORY_SORT_ORDER: Record<string, number> = {
  // Barra
  "Barra": 10,
  "Licores": 11,
  "Gaseosas": 12,
  "Vinos": 13,
  "Cócteles": 14,
  "Pulpas": 15,
  // Cocina
  "Cocina": 20,
  "Postres": 21,
  "Platos de Nevera": 22,
  "Importados": 23,
  "Congelador Blanco": 24,
  "Congelador #1": 25,
  "Congelador #2": 26,
  "Congelados Desayunos": 27,
};

/** Orden para categorías no curadas (van después de las conocidas). */
export const FALLBACK_ORDER = 500;

/** sortOrder para una categoría por su nombre. */
export function orderForCategoryName(name: string): number {
  return CATEGORY_SORT_ORDER[name] ?? FALLBACK_ORDER;
}
