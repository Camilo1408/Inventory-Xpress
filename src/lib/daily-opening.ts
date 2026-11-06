import { prisma } from "@/lib/db";
import { businessDayStart } from "@/lib/dates";

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
