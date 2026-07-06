// Configuración por instancia/cliente, centralizada. Lee process.env una sola vez.
// Regla del modelo multi-cliente: la diferencia entre clientes es configuración,
// no código. Los flags de features vienen OFF por defecto (propios de Cucina dei
// Fiori hoy); un cliente los enciende con su env var correspondiente.

const authMode = process.env.AUTH_MODE === "standalone" ? "standalone" : "integrated";

export const config = {
  authMode,
  brand: {
    name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Inventario",
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO ?? null,
  },
  features: {
    // Standalone habilita gestión de usuarios/roles/perfil (ya existía como AUTH_MODE).
    userManagement: authMode === "standalone",
    // OFF por defecto: control de licores por nivel de botella.
    cocktails: process.env.NEXT_PUBLIC_FEATURE_COCKTAILS === "true",
    // OFF por defecto: flujo de apertura/cierre de jornada.
    dailyInventory: process.env.NEXT_PUBLIC_FEATURE_DAILY_INV === "true",
  },
} as const;
