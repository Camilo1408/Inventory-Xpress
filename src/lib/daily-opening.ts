import { prisma } from "@/lib/db";
import { businessDayRange, businessDayStart } from "@/lib/dates";

type Db = Pick<typeof prisma, "product" | "stockMovement">;

/**
 * Stock de cada producto al INICIO del día de negocio `date`: el stock actual
 * menos los movimientos manuales (source = null) registrados desde ese inicio.
 *
 * El conteo inicial de la jornada representa las existencias con las que
 * arranca el día (lo que quedó ayer). Los movimientos del día —registrados
 * antes o después de abrir la jornada— se suman aparte en el "esperado", así
 * que la apertura debe conciliarse contra este valor y no contra el stock
 * actual; si no, un ingreso registrado antes de abrir se contaría dos veces
 * (o la conciliación lo borraría con un ajuste).
 *
 * Los movimientos automáticos (daily_*, bottle_adjust) no se restan: los de
 * cierres de jornadas anteriores forman parte de lo que quedó ayer.
 */
export async function openingStocks(
  productIds: string[],
  date: string,
  db: Db = prisma
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const [products, sums] = await Promise.all([
    db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, currentStock: true } }),
    db.stockMovement.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, source: null, createdAt: { gte: businessDayStart(date) } },
      _sum: { quantity: true },
    }),
  ]);
  const netToday = new Map(sums.map((s) => [s.productId, s._sum.quantity ?? 0]));
  return new Map(products.map((p) => [p.id, p.currentStock - (netToday.get(p.id) ?? 0)]));
}

/**
 * Neto de los movimientos manuales (source = null) registrados DESPUÉS del día de negocio
 * `date`, por producto.
 *
 * Una jornada se puede cerrar tarde: el restaurante trabaja pasada la medianoche y para
 * el sistema esos movimientos ya son del día siguiente. El conteo final describe cómo
 * terminó el día `date`, así que el cierre debe dejar el stock en ese conteo MÁS lo que
 * se registró después, no pisarlo. Sin esto, cerrar la jornada de ayer después de
 * registrar una entrada hoy borraba esa entrada con el ajuste del cierre, y la apertura
 * de hoy mostraba un stock de inicio negativo (stock actual − la entrada de hoy).
 */
export async function laterManualNet(
  productIds: string[],
  date: string,
  db: Pick<typeof prisma, "stockMovement"> = prisma
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const { end } = businessDayRange(date);
  const sums = await db.stockMovement.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, source: null, createdAt: { gt: end } },
    _sum: { quantity: true },
  });
  return new Map(sums.map((s) => [s.productId, s._sum.quantity ?? 0]));
}
