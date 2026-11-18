"use client";

// Paginación de listas en el cliente: la usan las tablas largas (productos, reportes) para
// que no se vean como un scroll infinito. `usePagination` corta la lista; `Pagination`
// dibuja el pie con «Por página», el rango mostrado y las flechas.

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PER_PAGE_OPTIONS = [10, 15, 20, 50] as const;

export interface PageSlice<T> {
  /** Filas de la página actual. */
  items: T[];
  /** Página actual, acotada al total (si un filtro redujo la lista, no queda en una página vacía). */
  page: number;
  totalPages: number;
  total: number;
  /** Índice (base 0) de la primera fila de la página. */
  start: number;
  perPage: number;
}

/** Corta `items` en páginas. Función pura: se prueba sin React. */
export function paginate<T>(items: T[], page: number, perPage: number): PageSlice<T> {
  const total = items.length;
  const size = Math.max(1, Math.floor(perPage));
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, totalPages, total, start, perPage: size };
}

/**
 * Estado de la paginación de una lista. `resetKey` resume los filtros que la producen:
 * cuando cambia, la lista vuelve a la primera página (sin efectos ni renders de más).
 */
export function usePagination<T>(items: T[], resetKey = "", initialPerPage = 20) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const [perPage, setPerPage] = useState(initialPerPage);
  const page = state.key === resetKey ? state.page : 1;
  const slice = paginate(items, page, perPage);
  return {
    ...slice,
    setPage: (p: number) => setState({ page: p, key: resetKey }),
    setPerPage: (n: number) => {
      setPerPage(n);
      setState({ page: 1, key: resetKey });
    },
  };
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  start: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  options?: readonly number[];
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  start,
  perPage,
  onPageChange,
  onPerPageChange,
  options = PER_PAGE_OPTIONS,
  className = "",
}: PaginationProps) {
  if (total === 0) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>Por página</span>
        <Select value={String(perPage)} onValueChange={(v) => onPerPageChange(Number(v))}>
          <SelectTrigger className="w-[72px] h-9" aria-label="Filas por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="tabular-nums">
          {start + 1}–{Math.min(start + perPage, total)} de {total}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-2"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-1 tabular-nums text-slate-600">{page}/{totalPages}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-2"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Página siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
