import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/catalog";
import { isPromoActive, priceCartItems, promoDiscountPercent, promoPrice, type Promotion } from "@/lib/promotions";

const promo = (over: Partial<Promotion> = {}): Promotion => ({
  id: "promo-1",
  product_id: "prod-1",
  tipo: "porcentaje",
  valor: 10,
  starts_at: null,
  ends_at: null,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const product = (over: Partial<Product> = {}): Product => ({
  id: "prod-1",
  codigo: "A1",
  nombre: "Producto",
  categoria: "CIGARRILLOS",
  proveedor: null,
  precio: 1000,
  stock: 10,
  sin_stock_manual: false,
  oculto: false,
  foto_url: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("promotions", () => {
  it("calcula porcentaje y precio fijo sin modificar la base", () => {
    expect(promoPrice(1000, promo({ tipo: "porcentaje", valor: 25 }))).toBe(750);
    expect(promoPrice(1000, promo({ tipo: "precio_fijo", valor: 800 }))).toBe(800);
    expect(promoPrice(1000, promo({ tipo: "precio_fijo", valor: 1200 }))).toBe(1000);
    expect(promoDiscountPercent(1000, 750)).toBe(25);
  });

  it("respeta active y fechas de vigencia", () => {
    const now = new Date("2026-06-10T12:00:00");
    expect(isPromoActive(promo(), now)).toBe(true);
    expect(isPromoActive(promo({ active: false }), now)).toBe(false);
    expect(isPromoActive(promo({ starts_at: "2026-06-11T00:00:00" }), now)).toBe(false);
    expect(isPromoActive(promo({ ends_at: "2026-06-09T00:00:00" }), now)).toBe(false);
  });

  it("aplica la promoción una sola vez en el carrito", () => {
    const items = priceCartItems(
      [{ codigo: "A1", nombre: "Producto", precio: 999, qty: 2 }],
      [product()],
      [promo({ tipo: "porcentaje", valor: 10 })],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.precioBase).toBe(1000);
    expect(items[0]!.precioUnitario).toBe(900);
    expect(items[0]!.ahorroUnitario).toBe(100);
    expect(items[0]!.descuentoPct).toBe(10);
  });

  it("no aplica promociones inactivas o vencidas", () => {
    const items = priceCartItems(
      [{ codigo: "A1", nombre: "Producto", precio: 1000, qty: 1 }],
      [product()],
      [promo({ active: false })],
      new Date("2026-06-10T12:00:00"),
    );
    expect(items[0]!.precioUnitario).toBe(1000);
    expect(items[0]!.ahorroUnitario).toBe(0);
  });
});
