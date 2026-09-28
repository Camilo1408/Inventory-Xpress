// scripts/lib/features.mjs
// Mapa único feature -> env var del lado de los scripts.
// ESPEJO de src/lib/config.ts: si allí se agrega un flag NEXT_PUBLIC_FEATURE_*,
// hay que agregarlo aquí. scripts/test-client-registry.mjs falla si se desincronizan.

/** Nombre en clients/registry.json -> env var que lo enciende en Vercel. */
export const FEATURE_ENV = {
  cocktails: "NEXT_PUBLIC_FEATURE_COCKTAILS",
  dailyInventory: "NEXT_PUBLIC_FEATURE_DAILY_INV",
};

/** Features válidas en el campo `features` del registro. */
export const KNOWN_FEATURES = Object.keys(FEATURE_ENV);
