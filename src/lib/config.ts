// Configuración por instancia/cliente, centralizada. Lee process.env una sola vez.
// Regla del modelo multi-cliente: la diferencia entre clientes es configuración,
// no código. Los flags de features vienen OFF por defecto (propios de Cucina dei
// Fiori hoy); un cliente los enciende con su env var correspondiente.

const authMode = process.env.AUTH_MODE === "standalone" ? "standalone" : "integrated";

export const config = {
  authMode,
  // Zona horaria del negocio: define cuándo empieza y termina la jornada operativa.
  // El servidor corre en UTC; sin esto el día saltaría a las 19:00 hora de Colombia.
  // Un cliente en otra zona la cambia con APP_TIMEZONE (IANA, ej. "America/Mexico_City").
  timezone: process.env.APP_TIMEZONE?.trim() || "America/Bogota",
  // Hora a la que empieza la jornada operativa (0–12). El restaurante trabaja pasada la
  // medianoche: con el corte a las 6:00, lo registrado a la 1:00 cuenta en la jornada de
  // la noche anterior, que es la que se está cerrando. Con el corte a medianoche esos
  // movimientos caían en el día siguiente y el cierre tardío los borraba. Un cliente lo
  // cambia con APP_DAY_START_HOUR.
  dayStartHour: parseDayStartHour(process.env.APP_DAY_START_HOUR),
  brand: {
    name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Inventario",
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO ?? null,
  },
  features: {
    // Standalone habilita gestión de usuarios/roles/perfil (ya existía como AUTH_MODE).
    // NOTA: acoplamiento INTENCIONAL a authMode — la gestión de usuarios solo existe
    // en modo standalone. No convertir esto en una env var independiente sin antes
    // desacoplar los guardas que lo consumen (isStandalone() en las rutas admin/*).
    userManagement: authMode === "standalone",
    // OFF por defecto: control de licores por nivel de botella.
    cocktails: process.env.NEXT_PUBLIC_FEATURE_COCKTAILS === "true",
    // OFF por defecto: flujo de apertura/cierre de jornada.
    dailyInventory: process.env.NEXT_PUBLIC_FEATURE_DAILY_INV === "true",
  },
} as const;

/** APP_DAY_START_HOUR: entero de 0 a 12. Vacío o inválido = 6. */
function parseDayStartHour(raw: string | undefined): number {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isInteger(n) && n >= 0 && n <= 12 ? n : 6;
}
