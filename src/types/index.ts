export type StockStatus = "ok" | "low" | "empty";

export type MovementType = "ENTRY" | "EXIT" | "ADJUSTMENT";

export interface CategoryWithCount {
  id: string;
  name: string;
  active: boolean;
  _count: { products: number };
}

export interface ProductWithCategory {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  imageUrl: string | null;
  active: boolean;
  category: { id: string; name: string };
}

export interface AlertItem {
  product: { id: string; name: string; unit: string };
  currentStock: number;
  minStock: number;
  deficit: number;
  category: { name: string };
}

export interface ShoppingListItem extends AlertItem {
  quantityToOrder: number;
}
