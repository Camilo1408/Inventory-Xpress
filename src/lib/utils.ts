import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { config } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: config.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatStock(value: number, unit: string): string {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)} ${unit}`;
}

export function getStockStatus(currentStock: number, minStock: number): "ok" | "low" | "empty" {
  if (currentStock <= 0) return "empty";
  if (minStock > 0 && currentStock <= minStock) return "low";
  return "ok";
}
