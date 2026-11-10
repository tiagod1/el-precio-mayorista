import { productBrand, type Product } from "@/lib/catalog";

export type SalesPeriod = "day" | "week" | "month" | "custom";

export type SalesOrder = {
  id: string;
  total: number;
  created_at: string;
};

export type SalesItem = {
  order_id: string;
  product_id: string | null;
  codigo: string;
  nombre: string;
  qty: number;
  line_total: number;
};

export type PeriodRange = { start: Date; end: Date };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function periodRange(period: SalesPeriod, customStart: string, customEnd: string, now = new Date()): PeriodRange {
  if (period === "day") {
    const start = startOfDay(now);
    return { start, end: new Date(start.getTime() + 86400000) };
  }
  if (period === "week") {
    const start = startOfDay(now);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return { start, end: new Date(start.getTime() + 7 * 86400000) };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  }
  const start = customStart ? startOfDay(new Date(`${customStart}T00:00:00`)) : startOfDay(now);
  const end = customEnd ? new Date(new Date(`${customEnd}T00:00:00`).getTime() + 86400000) : new Date(start.getTime() + 86400000);
  return { start, end };
}

export function previousPeriodRange(range: PeriodRange): PeriodRange {
  const ms = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - ms), end: range.start };
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function summarizeSales(orders: SalesOrder[], items: SalesItem[], products: Product[], range: PeriodRange) {
  const inRange = orders.filter((o) => {
    const t = new Date(o.created_at).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  });
  const orderIds = new Set(inRange.map((o) => o.id));
  const rangeItems = items.filter((i) => orderIds.has(i.order_id));
  const productByCodigo = new Map(products.map((p) => [p.codigo, p]));

  const daily = new Map<string, number>();
  for (const o of inRange) daily.set(dayKey(o.created_at), (daily.get(dayKey(o.created_at)) ?? 0) + Number(o.total));

  const byProduct = new Map<string, { codigo: string; nombre: string; units: number; revenue: number }>();
  const byBrand = new Map<string, { brand: string; units: number; revenue: number }>();
  for (const item of rangeItems) {
    const key = item.codigo;
    const current = byProduct.get(key) ?? { codigo: item.codigo, nombre: item.nombre, units: 0, revenue: 0 };
    current.units += item.qty;
    current.revenue += Number(item.line_total);
    byProduct.set(key, current);
    const product = productByCodigo.get(item.codigo);
    const brand = product ? productBrand(product) : "Sin marca";
    const b = byBrand.get(brand) ?? { brand, units: 0, revenue: 0 };
    b.units += item.qty;
    b.revenue += Number(item.line_total);
    byBrand.set(brand, b);
  }

  const units = rangeItems.reduce((s, i) => s + i.qty, 0);
  const total = inRange.reduce((s, o) => s + Number(o.total), 0);
  return {
    total,
    orders: inRange.length,
    units,
    avgTicket: inRange.length ? total / inRange.length : 0,
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ventas]) => ({ date, ventas: Math.round(ventas * 100) / 100 })),
    topProducts: [...byProduct.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 10),
    topBrands: [...byBrand.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 10),
  };
}

export function lowStockProducts(products: Product[], threshold = 5) {
  return products
    .filter((p) => !p.oculto && p.stock <= threshold)
    .sort((a, b) => a.stock - b.stock || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 12);
}
