"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { Search, X } from "lucide-react";

export interface JumpOption {
  /** productId: debe coincidir con el `data-product-row` de su fila. */
  id: string;
  name: string;
  /** Subcategoría (tarjeta) donde está el producto, para distinguir homónimos. */
  group: string;
}

/** Minúsculas y sin tildes: "limon" encuentra "Limón". */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

/**
 * Lleva al usuario a la fila de un producto: scroll hasta ella, la resalta un
 * momento y enfoca su campo de conteo. Cada producto se pinta dos veces
 * (tarjeta móvil + tabla de escritorio, una oculta por CSS), así que se busca
 * la copia visible por `data-product-row`; el campo a enfocar va marcado con
 * `data-jump-focus` (las filas de botella no tienen y solo se resaltan).
 */
export function useProductJump() {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const jumpTo = useCallback((productId: string) => {
    const row = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-product-row="${CSS.escape(productId)}"]`)
    ).find((el) => el.getClientRects().length > 0);
    if (!row) return;

    // El foco va en el mismo toque del usuario (si no, iOS no abre el teclado)
    // y sin su propio salto, para que mande el scroll centrado de abajo.
    const field = row.querySelector<HTMLElement>("[data-jump-focus]");
    field?.focus({ preventScroll: true });
    // Seleccionar el valor previo: escribir el conteo nuevo lo reemplaza.
    if (field instanceof HTMLInputElement) field.select();
    // Se centra el campo, no la fila: en la tabla de cierre de escritorio la
    // tabla es más ancha que la tarjeta y "Conteo real" (última columna) queda
    // tapado por el scroll horizontal; `inline: "nearest"` lo trae a la vista.
    const target = field ?? row;
    // Suave solo en saltos cortos. En móvil la lista de una categoría pasa de
    // 20.000px y el desplazamiento suave tarda segundos; si el usuario empieza a
    // escribir antes, el navegador lo corta a medio camino. Lejos → salto directo
    // (el resaltado orienta).
    const rect = target.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
    target.scrollIntoView({
      behavior: distance > window.innerHeight * 1.5 ? "instant" : "smooth",
      block: "center",
      inline: "nearest",
    });

    setHighlightedId(productId);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlightedId(null), 2500);
  }, []);

  return { highlightedId, jumpTo };
}

/**
 * Buscador fijo (sticky) sobre la lista de conteo del inventario diario.
 * Va DENTRO del <form> de la vista para quedarse pegado mientras se recorre
 * la lista; por eso Enter nunca envía el formulario.
 */
export function ProductJumpSearch({
  options,
  onSelect,
}: {
  options: JumpOption[];
  onSelect: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const indexed = useMemo(
    () => options.map((o) => ({ option: o, name: normalize(o.name), group: normalize(o.group) })),
    [options]
  );

  // Todas las palabras deben aparecer en nombre o subcategoría ("agua gas" →
  // "Agua con gas"). Primero los que empiezan por la búsqueda, luego los que la
  // contienen en el nombre, al final los que solo coinciden por subcategoría;
  // dentro de cada grupo se respeta el orden de la página.
  const results = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return indexed
      .filter((o) => tokens.every((t) => o.name.includes(t) || o.group.includes(t)))
      .map((o) => ({
        option: o.option,
        rank: o.name.startsWith(tokens[0]) ? 0 : tokens.every((t) => o.name.includes(t)) ? 1 : 2,
      }))
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.option);
  }, [indexed, query]);

  // Mantiene visible la opción resaltada desplazando SOLO la lista. Con
  // scrollIntoView también se movería <main>, y en móvil eso corta el salto al
  // producto: el toque dispara mouseenter (cambia `highlighted`) justo antes
  // del click, y este efecto corre cuando el salto suave ya arrancó.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[highlighted] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) {
      list.scrollTop = item.offsetTop;
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [highlighted]);

  function choose(o: JumpOption) {
    setQuery("");
    setOpen(false);
    setHighlighted(0);
    onSelect(o.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlighted]) choose(results[highlighted]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }

  const showList = open && query.trim() !== "";
  const activeId = showList && results[highlighted] ? `${listId}-${highlighted}` : undefined;

  return (
    // El sticky respeta el padding de <main> (p-4 sm:p-6 en DashboardShell): con
    // top-0 quedaría una franja arriba por donde se ve la lista pasar. El top
    // negativo lo pega al borde real del área de scroll.
    <div className="sticky -top-4 sm:-top-6 z-20 bg-[#F8FAFC] py-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Buscar producto en la lista"
          value={query}
          placeholder="Buscar producto para ir a su conteo..."
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setQuery(e.target.value); setHighlighted(0); setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full h-10 pl-9 pr-9 rounded-md border border-slate-200 bg-white text-base md:text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        {query && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(""); setHighlighted(0); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {showList && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm py-1"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-slate-400 text-center">Sin resultados</li>
            ) : (
              results.map((o, i) => (
                <li
                  key={o.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlighted}
                  // mousedown sin preventDefault quitaría el foco del input antes del click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-2 ${
                    i === highlighted ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {/* El nombre nunca se corta (en móvil distingue "…DE CARNE" de "…DE QUESO"); cede la subcategoría. */}
                  <span className="min-w-0">{o.name}</span>
                  <span className={`text-xs shrink-0 max-w-[45%] truncate ${i === highlighted ? "text-blue-500" : "text-slate-400"}`}>
                    {o.group}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
