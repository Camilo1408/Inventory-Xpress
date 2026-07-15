import { cache } from "react";
import { prisma } from "./db";

/**
 * Productos numéricos candidatos a alerta de stock (activos con mínimo definido),
 * con el nombre de su categoría, ordenados por nombre.
 *
 * Envuelto en `cache()` de React: dentro de una MISMA petición (render de layout
 * + página), esta consulta se ejecuta UNA sola vez y se comparte, en vez de
 * repetirse en el layout (badge) y en el dashboard (conteo + lista). El filtro
 * final `currentStock <= minStock` se hace en memoria porque Prisma no compara
 * dos columnas entre sí en el `where`.
 */
export const getNumericAlertProducts = cache(async () => {
  return prisma.product.findMany({
    where: { active: true, minStock: { gt: 0 } },
    select: {
      id: true,
      name: true,
      unit: true,
      currentStock: true,
      minStock: true,
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
});
