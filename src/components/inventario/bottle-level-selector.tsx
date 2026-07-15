"use client";

import { Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BOTTLE_LEVELS, bottleLevelMeta, type BottleLevel } from "@/lib/bottle";

export function BottleLevelSelector({
  value,
  onChange,
  disabled,
}: {
  value: BottleLevel | null;
  onChange: (v: BottleLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BOTTLE_LEVELS.map((lvl) => {
        const selected = value === lvl.key;
        return (
          <button
            key={lvl.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(lvl.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? `${lvl.badgeClass} border-transparent ring-2 ring-offset-1 ring-slate-300`
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", lvl.dotClass)} />
            {lvl.label}
          </button>
        );
      })}
    </div>
  );
}

export function ReserveCounter({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Disminuir reserva"
      >
        <Minus className="w-3.5 h-3.5" />
      </Button>
      <span className="w-8 text-center tabular-nums text-sm font-semibold text-slate-800">
        {value}
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label="Aumentar reserva"
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function BottleLevelBadge({ level }: { level: BottleLevel | null }) {
  if (!level) return <span className="text-slate-400 text-sm">—</span>;
  const meta = bottleLevelMeta(level);
  return <Badge className={`${meta.badgeClass} border-0`}>{meta.label}</Badge>;
}

/**
 * Indicador activable/desactivable (un solo flag, no dos estados): la botella
 * está marcada para shots/copeo, o no lo está. Clic para alternar.
 */
export function ShotsCopeoToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors shrink-0",
        value
          ? "bg-purple-100 text-purple-700 border-transparent ring-2 ring-offset-1 ring-slate-300"
          : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      Shots/Copeo
    </button>
  );
}

export function ShotsCopeoBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px]">Shots/Copeo</Badge>;
}
