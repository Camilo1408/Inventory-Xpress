/** Convierte un nombre en un slug estable para claves de permiso (sin acentos, kebab-case). */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // quitar acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "categoria";
}

/**
 * Devuelve un slug único dado el nombre y el conjunto de slugs ya usados.
 * Si colisiona, agrega sufijos -2, -3, …
 */
export function uniqueSlug(name: string, used: Set<string>): string {
  const base = slugify(name);
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
}
