import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/catalog";
import { periodRange, previousPeriodRange, summarizeSales, type SalesItem, type SalesOrder } from "@/lib/stats";

const product = (over: Partial<Product> = {}): Product => ({
  id: "prod-1",
  codigo: "A1",
  nombre: "Cigarro Marca",
  categoria: "CIGARRILLOS",
  proveedor: "Proveedor",
  precio: 1000,
  stock: 10,
  sin_stock_manual: false,
  oculto: false,
  foto_url: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("stats", () => {
  it("arma rangos de día, semana, mes y personalizado", () => {
    const now = new Date(2026, 5, 10, 15, 0, 0); // miércoles 10 jun 2026
    expect(periodRange("day", "", "", now).start.getDate()).toBe(10);
    expect(periodRange("month", "", "", now).start.getMonth()).toBe(5);
    const custom = periodRange("custom", "2026-06-01", "2026-06-03", now);
    expect(custom.start.getDate()).toBe(1);
    expect(custom.end.getDate()).toBe(4);
    const prev = previousPeriodRange({ start: new Date(2026, 5, 10), end: new Date(2026, 5, 11) });
    expect(prev.start.getDate()).toBe(9);
    expect(prev.end.getDate()).toBe(10);
  });

  it("resume solo pedidos dentro del rango confirmado", () => {
    const range = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 11) };
    const orders: SalesOrder[] = [
      { id: "o1", total: 1000, created_at: "2026-06-10T10:00:00" },
      { id: "o2", total: 500, created_at: "2026-06-09T23:59:59" },
    ];
    const items: SalesItem[] = [
      { order_id: "o1", product_id: "prod-1", codigo: "A1", nombre: "Cigarro Marca", qty: 2, line_total: 1000 },
      { order_id: "o2", product_id: "prod-1", codigo: "A1", nombre: "Cigarro Marca", qty: 5, line_total: 500 },
    ];
    const s = summarizeSales(orders, items, [product()], range);
    expect(s.total).toBe(1000);
    expect(s.orders).toBe(1);
    expect(s.units).toBe(2);
    expect(s.topProducts[0]).toMatchObject({ codigo: "A1", units: 2 });
    expect(s.topBrands[0]).toMatchObject({ brand: "MARCA", units: 2 });
  });
});
