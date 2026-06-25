/**
 * Carga de datos de prueba (Fiori) — Fase 2 del control de licores por botella.
 *
 * Crea las categorías raíz (Barra, Cocina) con sus subcategorías y todos los
 * productos de los archivos `## INVENTARIO DE BARRA.txt` y `## Inventario de
 * Cocina.txt`, con stock de prueba diferenciado por producto. Los productos de
 * la subcategoría Cócteles reciben nivel de botella + reserva (y algunos un
 * umbral de alerta propio).
 *
 * Idempotente: re-ejecutarlo no duplica categorías ni productos.
 *
 * Uso: npx tsx scripts/seed-fiori.ts
 */
import { PrismaClient } from "../src/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { uniqueSlug } from "../src/lib/slug";
import { BOTTLE_LEVELS, type BottleLevel } from "../src/lib/bottle";
import { orderForCategoryName } from "../src/lib/category-order";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL ?? "file:./inventario.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

const SEED_USER = { id: "seed", name: "Seed Script" };

interface SubcatDef {
  name: string;
  unit: string;
  products: string[];
}
interface RootDef {
  name: string;
  subcats: SubcatDef[];
}

const DATA: RootDef[] = [
  {
    name: "Barra",
    subcats: [
      {
        name: "Licores",
        unit: "botellas",
        products: [
          "AGUA TONICA SCHWEPPES", "AGUARDIENTE TAPA AZUL", "AGUARDIENTE TAPA NEGRA",
          "CERVEZA BRUGSE ZOT", "CERVEZA CORONA", "CERVEZA HEINIKEN", "CERVEZA HENDRIK",
          "CERVEZA MICHELOB", "CERVEZA MILLER", "CERVEZA REEPER B", "CERVEZA DUVEL",
          "CERVEZA ESTRELLA DE GALICIA", "WHISKY BUCHANAN'S", "WHISKY OLD PARR",
          "WHISKY JACK DANIEL'S HONEY",
        ],
      },
      {
        name: "Gaseosas",
        unit: "unidades",
        products: ["FUZE TEA", "COCA COLA", "COCA COLA ZERO", "GINGER", "QUATRO", "SPRITE", "AGUA BRISA SABORIZADA"],
      },
      {
        name: "Vinos",
        unit: "botellas",
        products: [
          "CASILLERO DEL DIABLO", "FINCA LAS MORAS BLACK LABEL", "FINCA LAS MORAS BONARDA",
          "FINCA LAS MORAS MALBEC", "FINCA LAS MORAS CABERNET SAUVIGNONG", "FINCA LAS MORAS CHARDONAY",
          "PANUL BLANCO", "PANUL TINTO", "PROTOS", "TAPARACA", "LAMBRUSCO", "5TA LAS CABRAS",
        ],
      },
      {
        name: "Cócteles",
        unit: "botellas",
        products: [
          "TRIPLE SEC", "MARTINI", "BACARDI RON BLANCO", "RON ZACAPA AMBAR", "VERMOUTH EXTRA SECO",
          "GINEBRA GORDON'S", "GINEBRA BEEFEATER", "GINEBRA SELVA", "VODKA SMIRNOFF", "VODKA ABSOLUT",
          "CAMPARI", "APEROL SPRITZ", "TEQUILA JOSE CUERVO", "SOHO",
        ],
      },
      {
        name: "Pulpas",
        unit: "kg",
        products: ["FRUTOS ROJOS", "FRUTOS AMARILLOS", "KIWI", "COCO", "NARANJA", "CHOLUPA"],
      },
    ],
  },
  {
    name: "Cocina",
    subcats: [
      { name: "Postres", unit: "porciones", products: ["PANNACOTAS", "TIRAMISU", "CREME BRULEE", "PROFITEROLES", "CAPRESSE"] },
      { name: "Platos de Nevera", unit: "porciones", products: ["LASAGNA FIORI", "LASAGNA SALMON", "CREMA DE LECHE"] },
      {
        name: "Importados",
        unit: "kg",
        products: [
          "PANCETA", "GUANCHALE", "TOCINETA AHUMADA", "PEPPERONI", "SALAMI", "PROSCIUTTO",
          "JAMON SERRANO", "CERDO", "QUESO GOUDA", "MIX DE QUESOS", "QUESO PARMESANO CARPACCIO",
          "QUESO AZUL", "FRIDA", "QUESO PECORINO", "JAMON", "QUESO PEPPERONI", "JAMON DE PISTACHO", "PARMESANO",
        ],
      },
      {
        name: "Congelador Blanco",
        unit: "kg",
        products: [
          "CAMARAON 36-40", "LANGOSTINOS", "PALMITOS DE CANGREJO", "PULPO IMPORTADO", "CABEZAS DE PEZ",
          "SALMON", "ATUN", "MEJILLONES VERDES", "MEJILLONES NEGROS", "CAMARON 26-30", "MOLIDA DE CERDO",
          "MOLIDA DE RES", "RECORTES DE CARNE", "CARPACCIO DE SALMON", "CARPACCIO DE RES", "CARPACCIO DE PULPO",
          "MOZARELLA", "ALBONDIGAS",
        ],
      },
      {
        name: "Congelador #1",
        unit: "porciones",
        products: [
          "BURRATA", "STRACCIATELLA", "RICOTTA", "BOCCONCINI", "NODINOS", "POLLO X300GR",
          "LANGOSTINOS DESCONGELADOS", "PALMITOS PICADOS", "ANILLOS DE CALAMAR", "PULPO X80-100GR",
          "CAMARON PRIMAVERAS X100GR", "SCOGLIOS X150GR (ANILLOS Y CAMARON)",
          "CATAPLANAS X200GR (PULPO, CAMARON, ANILLOS, PALMITOS, MEJILLONES Y LANGOSTINOS)", "STROGONOFF",
        ],
      },
      {
        name: "Congelador #2",
        unit: "porciones",
        products: [
          "RAVIOLIS SALMON", "RAVIOLIS RICOTTA", "RAVIOLI BOLOGNESA", "RAVIOLIS DE MOZARELLA", "TORTELINIS",
          "MIA TERRA", "SALMON X300GR", "ATUN X300GR", "LOMO FINO X250GR", "TILAPIA X200GR",
          "FUSILI BLANQUEADO", "ARROZ BLANQUEADO", "PARPADELLE BLANQUEADO", "VEMICHELLI BLANQUEADO",
          "SPAGHETTI BLANQUEADO", "RIGATONI BLANQUEADO", "FARFALLE BLANQUEADO", "PENNETTE BLANQUEADO",
          "PANCETA X60GR", "BIFE CHORIZO (UND AL VACIO)",
        ],
      },
      {
        name: "Congelados Desayunos",
        unit: "unidades",
        products: [
          "ENVOLTINI", "MORCILLA DE CHOCLO", "DEDITOS DE QUESO", "PAN GLORIA", "CROISSANT",
          "CARIMAÑOLAS DE QUESO", "CARIMAÑOLAS DE CARNE", "AREPA DE HUEVO", "PAN PANINI", "CANAPES",
        ],
      },
    ],
  },
];

const LEVEL_KEYS = BOTTLE_LEVELS.map((l) => l.key) as BottleLevel[];

async function getOrCreateCategory(name: string, parentId: string | null, used: Set<string>) {
  const existing = await prisma.category.findFirst({ where: { name, parentId } });
  if (existing) {
    if (existing.slug) used.add(existing.slug);
    return existing;
  }
  const slug = uniqueSlug(name, used);
  used.add(slug);
  return prisma.category.create({ data: { name, parentId, slug, sortOrder: orderForCategoryName(name) } });
}

async function main() {
  // Conjunto de slugs ya usados (para unicidad estable).
  const existingSlugs = await prisma.category.findMany({ where: { slug: { not: null } }, select: { slug: true } });
  const used = new Set(existingSlugs.map((c) => c.slug as string));

  let stockSeed = 5; // stock de prueba incremental, distinto por producto
  let levelIdx = 0;
  let createdProducts = 0;

  for (const root of DATA) {
    const rootCat = await getOrCreateCategory(root.name, null, used);
    for (const sub of root.subcats) {
      const subCat = await getOrCreateCategory(sub.name, rootCat.id, used);
      const isCocteles = subCat.slug === "cocteles";

      for (const prodName of sub.products) {
        const exists = await prisma.product.findFirst({ where: { name: prodName, categoryId: subCat.id } });
        if (exists) continue;

        if (isCocteles) {
          // Producto de botella: nivel cíclico, reserva variada, umbral en algunos.
          const level = LEVEL_KEYS[levelIdx % LEVEL_KEYS.length];
          const reserve = levelIdx % 3 === 0 ? 0 : (levelIdx % 3); // 0,1,2,0,1,2...
          const alert = levelIdx % 4 === 0 ? "quarter" : null;     // algunos con umbral propio
          await prisma.product.create({
            data: {
              name: prodName,
              categoryId: subCat.id,
              unit: sub.unit,
              minStock: 0,
              bottleLevel: level,
              reserveBottles: reserve,
              alertBottleLevel: alert,
            },
          });
          levelIdx += 1;
          createdProducts += 1;
        } else {
          // Producto numérico: stock de prueba distinto + minStock variado, via ENTRY.
          const stock = stockSeed;
          const minStock = stockSeed % 7; // algunos con mínimo > 0 para probar alertas
          stockSeed += 3;
          const product = await prisma.product.create({
            data: { name: prodName, categoryId: subCat.id, unit: sub.unit, minStock },
          });
          if (stock > 0) {
            await prisma.$transaction([
              prisma.stockMovement.create({
                data: {
                  productId: product.id,
                  type: "ENTRY",
                  quantity: stock,
                  notes: "Carga inicial de prueba (seed-fiori)",
                  userId: SEED_USER.id,
                  userName: SEED_USER.name,
                },
              }),
              prisma.product.update({ where: { id: product.id }, data: { currentStock: { increment: stock } } }),
            ]);
          }
          createdProducts += 1;
        }
      }
    }
  }

  console.log(`✓ Seed Fiori completo. Productos nuevos creados: ${createdProducts}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
